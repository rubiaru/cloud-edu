// 환경 변수를 사용을 위한 라이브러리 로드, 변수 로드
require('dotenv').config();

// 이미지 용량 최소화를 위한 라이브러리 로드
const imagemin = require('imagemin');
// png 이미지 포맷 관련 라이브러리 로드
const imageminPngquant = require('imagemin-pngquant');

// * 이미지를 전송하고 받기 위한 큐 이름
const RECV_QUEUE = 'optimizeimg';

// 큐에서 메세지를 수신 후 처리 후 큐로 재전송
const rabbitMQAddress=`amqp://${process.env.rabbitMQAddress}`;
require('amqplib').connect(rabbitMQAddress)
    .then(conn =>conn.createChannel())
    .then(ch => {
        ch.assertQueue(RECV_QUEUE)
            .then(() => {
                //메세지가 들어오는지 감시 하다가, 처리함
                ch.consume(RECV_QUEUE, msg => {
                    imagemin.buffer(msg.content, {
                        plugins: [imageminPngquant()]
                    })
                    .then(out => {
                        //메세지를 받을 때 프로퍼피로 받은 reply queue로 처리된 이미지 버퍼를 재전송
                        //upload 서비스에서는 이벤트 전송 예정
                        ch.sendToQueue(msg.properties.replyTo, out, { correlationId: msg.properties.correlationId });
                        console.log(`work process correlationId ${msg.properties.correlationId} image resend`);
                        //메세지와 함께 작업 완료 했다고 대답
                        ch.ack(msg);
                    });
                });
            });
    });
