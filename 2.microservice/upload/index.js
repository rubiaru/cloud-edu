/**
 *  주석 설명에 [*] 표시가 있는 부분은 전에 했던 monolithic 코드에서 추가된 부분입니다.
 */

// 환경 변수를 사용을 위한 라이브러리 로드, 변수 로드
require('dotenv').config();

// * AMQP 라이브러리 로드 - rabbitMQ 서버 접속에 사용 
const amqplib = require('amqplib');

// 이미지 축소를 위한 라이브러리 로드
const imagemin = require('imagemin');
const imageminPngquant = require('imagemin-pngquant');

// express 서비스를 사용하기 위한 라이브러리 로드
const express = require('express');
// express에 파일 업로드를 사용하기 위한 라이브러리 로드
const fileUpload = require('express-fileupload');

// 파일 전송을 위한 라이브러리 로드
var fs = require('fs');

// 이벤트사용을 위한 라이브러리 로드
var events = require('events');

// 이벤트 생성 및 호출을 위한 EventEmitter 객체 생성
var eventEmitter = new events.EventEmitter();

// s3에 이미지 전송을 위한 라이브러리 로드, 설정
var AWS = require('aws-sdk');
AWS.config.region = process.env.region;
AWS.config.update({
    accessKeyId: process.env.accessKeyId,
    secretAccessKey: process.env.secretAccessKey
  });
var s3 = new AWS.S3();

// * 큐 채널 
let channel = null;

// * 이미지를 전송하고 받기 위한 큐 이름
const SEND_QUEUE = 'optimizeimg';
const RECV_QUEUE ='amq.rabbitmq.reply-to';

// 현재 서버에서 네트워크 가드 정보를 읽어서 첫번째로 읽혀지는 ipaddress 값 조회
var ifs = require('os').networkInterfaces();
var address = process.env.dnsName || Object.keys(ifs)
    .map(x => ifs[x].filter(x => x.family === 'IPv4' && !x.internal)[0])
    .filter(x => x)[0].address;

// exporess로 웹 서버를 실행할 때 사용할 포트
var port = process.env.port || 4000;

// * queue 서버에 접속하기 위한 작업
function init() {
    // * queue 주소 
    const rabbitMQAddress=`amqp://${process.env.rabbitMQAddress}`;
    // 연결 시도 
    // 채널 생성 
    // 메세지 수신
    return require('amqplib').connect(rabbitMQAddress)
        .then(conn => conn.createChannel())
        .then(ch => {
            // 전역에서 설정된 큐 채널 변수에 생성한 채널을 할당 
            channel = ch;
            //amq.rabbitmq.reply-to 큐에 메세지가 들어오면 
            //이미지 아이디와 이미지를 파라미터로 이벤트 호출
            //이벤트 선언은
            // [// 이벤트 선언] 주석 아래에 있음
            ch.consume(RECV_QUEUE, 
                        msg => {
                            eventEmitter.emit(msg.properties.correlationId, msg);
                        }, 
                        {noAck: true}
            );
        });
}

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
app.get('/', (req, res) => res.send('이미지 사이즈를 줄이는 서비스입니다. /upload/에 POST, form-data 방식으로 png 파일을 전송해보세요.!!!***'));

// /upload 주소에 이미지 전송 시
// 큐에 이미지를 전송
// 용량이 최적화된 이미지가 다시 돌아오면 
// 저장소에 저장(로컬이던 s3던)
// 해당 이미지를 웹에서 볼 수 있도록 url 주소 리턴 
app.post('/upload', (req, res) => {

   let img = req.files.image;

   let id = randomid() + img.name;

   // 이벤트 선언
   // once는 한번 실행 후 두번은 실행 안됨
   eventEmitter.once(id, msg => {
       /* save image /uploads/ folder
        var wstream = fs.createWriteStream(`uploads/${id}`);
        wstream.write(out);
        wstream.end();
        var responseImgUrl = `http://${address}:${port}/uploads/${id}`;
        res.json(responseImgUrl);
        res.end();
        */
        // save image AWS s3
        const data = msg.content;
        const worker_id = msg.properties.workerId;
        
        console.log(`msg.properties * ${JSON.stringify(msg.properties)}`);
        console.log(`msg.properties.correlationId * ${JSON.stringify(msg.properties.correlationId)}`);
        var param = {
            'Bucket':process.env.bucketName,
            'Key':id,
            'ACL':'public-read',
            'Body':data,
            'ContentType':'image/png'
        }
        s3.upload(param, function(err, data){
            console.log(err);
            if (err) {
                res.json(JSON.stringify(err));
            } else {
                let response = {};
                response.s3_response = data;
                response.upload_address = address;
                response.worker_id = worker_id;
                console.log(JSON.stringify(response));
                res.json(response);
            }
            res.end();
        })
   });

   // * assertQueue - 해당 큐가 있으면 가져오고, 없으면 새로 생성
   channel.assertQueue(SEND_QUEUE)
       // 리턴된 큐에 이미지를 전송
       .then(() => {
            console.log(`이미지 사이즈를 줄이는 작업을 전달하기 위해 '${SEND_QUEUE}' queue에 전송`);   
            channel.sendToQueue(SEND_QUEUE, img.data, {correlationId:id, replyTo: RECV_QUEUE});
       });

});

// express 서비스만 실행 할 때
// app.listen(port, () => console.log(`Monolithic Image Upload Example App listening...  ${address}:${port}`));
// * queue 서비스와 연동 후 성공하면 express 서비스 실행
init()
    .then(() => app.listen(port, () => console.log(`Microservice Image Upload Example App Listening...  ${address}:${port}`)))
    .catch(err=>console.error(err));

