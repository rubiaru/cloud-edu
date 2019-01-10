// config load
require('dotenv').config();

// 퍼블릭 IP를 VM MetaData에서 가져옴
var publicIP = ''
if (process.env.nodeEnv == 'azure-production') {
    // vm meta data 정보 확인
    // https://docs.microsoft.com/en-us/azure/virtual-machines/windows/instance-metadata-service

    // node 소스가 실행되는 vm에서 public ip 정보를 가져온다
    const request = require('sync-request');
    const metadataResponse = request('GET', 'http://169.254.169.254/metadata/instance/network/interface/0/ipv4/ipAddress/0/publicIpAddress?api-version=2017-08-01&format=text', {
        headers: {
            'Metadata': 'true'
        },
    });

    publicIP = metadataResponse.getBody('utf8');
    console.log(`Azure VM Public IP: ${publicIP}`);
}


// image minimize
const imagemin = require('imagemin');
const imageminPngquant = require('imagemin-pngquant');

// express 
const express = require('express');
const fileUpload = require('express-fileupload');

// 전송된 파일을 저장
var fs = require('fs');

// events 모듈 사용
var events = require('events');

// s3에 이미지 전송을 위한 라이브러리 로드, 설정
var AWS = require('aws-sdk');
AWS.config.region = process.env.region;
AWS.config.update({
    accessKeyId: process.env.accessKeyId,
    secretAccessKey: process.env.secretAccessKey
  });
var s3 = new AWS.S3();

// ip 주소 알아내기
var ifs = require('os').networkInterfaces();
// 클라우드에 올리는 경우 IP 주소 조회가 작동하지 않습니다.
// .env 파일에 dnsName이나 public ip를 입력해주세요.

var address = process.env.dnsName || publicIP || Object.keys(ifs)
    .map(x => ifs[x].filter(x => x.family === 'IPv4' && !x.internal)[0])
    .filter(x => x)[0].address;
   
// 서버 port
var port = process.env.port || 4000;

// 랜덤한 문자열 생성
function randomid() {
    return new Date().getTime().toString() + Math.random().toString() + Math.random().toString();
}

// express 인스턴스 선언
const app = express();

// 이미지 업로드를 위한 공간 설정
// - s3로 변경할때는 사용하지 않음 
app.use(fileUpload({ safeFileNames: true, preserveExtension: true }));
app.use('/uploads', express.static(__dirname + '/uploads'));


// 기본 접속 시 설명 문구를 출력
app.get('/', (req, res) => res.send('이미지 사이즈를 줄이는 서비스입니다. /upload/에 POST, form-data 방식으로 png 파일을 전송해보세요.'));

// /upload 주소에 이미지 전송 시
// UPLOAD 폴더에 이미지를 저장 후 경로를 리턴
// s3 연동하는 경우 S3에 이미지 업로드 후 경로를 리턴 
app.post('/upload', (req, res) => {
    
    let img = req.files.image; 

    let id = randomid() + req.files.image.name;

    imagemin.buffer(img.data, {
        plugins: [imageminPngquant()]
    })
    .then(out => {
        // * nodejs가 실행되는 서버에 저장
        // save image /uploads/ folder       
         
        var wstream = fs.createWriteStream(`uploads/${id}`);
        wstream.write(out);
        wstream.end();
        var responseImgUrl = `http://${address}:${port}/uploads/${id}`;
        res.json(responseImgUrl);
        res.end();                
        
        // save image AWS s3                
        /*
        var param = {
            'Bucket':process.env.bucketName,
            'Key':id,
            'ACL':'public-read',
            'Body':out,
            'ContentType':'image/png'
        }
        s3.upload(param, function(err, data){
            console.log(err);
            console.log(data);
            if (err) {
                res.json(JSON.stringify(err));
            } else {
                res.json(data);
            }
            res.end();
        })
        */
    });

});

// express 서비스 시작
app.listen(port, () => console.log(`Monolithic Image Upload Example App listening...  ${address}:${port}`));
