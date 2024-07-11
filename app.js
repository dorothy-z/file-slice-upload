const http = require('http')
const path = require('path')
const fse = require('fs-extra')
const multiparty = require('multiparty')

// resolve 的作用是将路径进行合并， __dirname 是当前文件的绝对路径，.是下一级，文件夹就叫 chunks
const UPLOAD_DIR = path.resolve(__dirname, '.', 'chunks')   // 准备好地址用来存切片

const resolvePost = (req) => {
  return new Promise((resolve, reject) => {
    let chunk = ''   // 参数数据包
    req.on('data', (data) => {
      chunk += data
    })
    req.on('end', () => {
      resolve(JSON.parse(chunk))
    })
  })
}

const server = http.createServer(async (req, res) => {
  // 解决跨域
  res.setHeader('Access-Control-Allow-Origin', '*')  // 允许所有的请求源来跨域
  res.setHeader('Access-Control-Allow-Headers', '*')   // 允许所有的请求头来跨域

  // 请求预检
  if (req.method === 'OPTIONS') {
    // console.log('options');
    res.status = 200
    res.end()
    return
  }
  
  if (req.url === '/upload') {
    const form = new multiparty.Form();
    form.parse(req, (err, fields, files) => {
      if (err) {
        console.log(err);
        return
      }
      // console.log(req.headers, 'req');
      // console.log(fields, files);
      const file = files.file[0]      // 切片的内容
      const fileName = fields.fileName[0]
      const chunkName = fields.chunkName[0]
      
      // 拿到切片先存入再合并，存入的目的就是防止顺序错乱
      // const chunkDir = path.resolve(UPLOAD_DIR, `${fileName}-chunks`)   // 文件名不同，文件目录就不同
      if (!fse.existsSync(UPLOAD_DIR)) { // 判断目录是否存在
        fse.mkdirsSync(UPLOAD_DIR)   // 创建这个文件
      }
      // 将切片写入到文件夹中
      fse.moveSync(file.path, `${UPLOAD_DIR}/${chunkName}`)
      res.end('获取切片成功')
    })
  } else if (req.url === '/merge') {
    const { fileName, size } = await resolvePost(req) // 解析前端传过来的参数
    console.log(fileName, size);
    await mergeFileChunks(UPLOAD_DIR, fileName, size)
    res.end('合并成功')
  }
})

const mergeFileChunks = async(filePath, fileName, size) => {  // 写个async就相当于new promise
  // 读取filePath下所有的切片
  const chunks = await fse.readdir(filePath)  // 读文件夹的所有文件
  console.log(chunks);
  // 防止切片顺序错乱
  chunks.sort((a, b) => a.split('-')[1] - b.split('-')[1])  // sort会影响原数组，无需赋值

  // 合并片段：转换成流类型
  const arr = chunks.map((chunkPath, index) => {
    return pipeStream(
      path.resolve(filePath, chunkPath),   // 合并切片的文件路径
      fse.createWriteStream(  // 合并地点
        path.resolve(filePath, fileName),
        {
          start: index * size,
          end: (index + 1) * size
        }
      )  
    )
  })
  await Promise.all(arr)
} 

const pipeStream = (filePath, writeStream) => {
  // console.log(filePath);
  return new Promise((resolve, reject) => {
    const readStream = fse.createReadStream(filePath)
    readStream.on('end', () => {
      fse.unlinkSync(filePath)   // 移除切片
      resolve()
    })
    readStream.pipe(writeStream)    // 将切片读成流汇入到可写流中
  })
}

server.listen(3000, () => {
  console.log('listening on port 3000');
})