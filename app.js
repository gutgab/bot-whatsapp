//per
const fetch = require('node-fetch')
//per
require('dotenv').config()
const fs = require('fs');
const express = require('express');
const cors = require('cors')
const qrcode = require('qrcode-terminal');
const { Client, LegacySessionAuth, LocalAuth } = require('whatsapp-web.js');
const mysqlConnection = require('./config/mysql')
const { middlewareClient } = require('./middleware/client')
const { generateImage, cleanNumber, checkEnvFile, createClient } = require('./controllers/handle')
const { connectionReady, connectionLost } = require('./controllers/connection')
const { saveMedia } = require('./controllers/save')
const { getMessages, responseMessages, bothResponse } = require('./controllers/flows')
const { sendMedia, sendMessage, lastTrigger, sendMessageButton, readChat } = require('./controllers/send')
const app = express();
app.use(cors())
app.use(express.json())
const MULTI_DEVICE = process.env.MULTI_DEVICE || 'false';
const server = require('http').Server(app)
const io = require('socket.io')(server, {
    cors: {
        origins: ['http://localhost:4200']
    }
})

let socketEvents = {sendQR:() => {} ,sendStatus:() => {}};

io.on('connection', (socket) => {
    const CHANNEL = 'main-channel';
    socket.join(CHANNEL);
    socketEvents = require('./controllers/socket')(socket)
    console.log('Se conecto')
})

app.use('/', require('./routes/web'))

const port = process.env.PORT || 3000
const SESSION_FILE_PATH = './session.json';
var client;
var sessionData;

/**
 * Escuchamos cuando entre un mensaje
 */
const listenMessage = () => client.on('message', async msg => {
    const { from, body, hasMedia } = msg;
    // Este bug lo reporto Lucas Aldeco Brescia para evitar que se publiquen estados
    if (from === 'status@broadcast') {
        return
    }
    message = body.toLowerCase();
    console.log('BODY',message)
    const number = cleanNumber(from)
    await readChat(number, message)

    //PERS
    const url='http://207.246.79.29/users'
    //PERS


    const envioDeMensajeAlAPI=()=>{
        var data = JSON.stringify({ "cedula": "10361534", "token": "gipSOvKO_rD-0UQzWIiZFw" })
        fetch('http://10.0.32.151:5000/users',{method:'POST',headers:{"Content-type":"application/json"},body:JSON.stringify({'numero':from,'msg':message})})
        .then(response => response.json())
        .then( async data => {
            if(data['botones']==true){
                await sendMessageButton(client,from,data['repplyMessage'],data['actions'])
            }
            else if(data['media']!=''){
                    sendMedia(client, from, data.media);
            }
            else await sendMessage(client, from, data['repplyMessage'], null)
        })
    }
    envioDeMensajeAlAPI();
/*     if (step) {
        const response = await responseMessages(step);
        await sendMessage(client, from, response.replyMessage, response.trigger);
        if(response.hasOwnProperty('actions')){
            const { actions } = response;
            await sendMessageButton(client, from, null, actions);
            return
        }
    } */
    /**
     * Guardamos el archivo multimedia que envia
     */
/*     if (process.env.SAVE_MEDIA && hasMedia) {
        const media = await msg.downloadMedia();
        saveMedia(media);
    } */

    /**
     * Si estas usando dialogflow solo manejamos una funcion todo es IA
     */
/*     if (process.env.DATABASE === 'dialogflow') {
        const response = await bothResponse(message);
        await sendMessage(client, from, response.replyMessage);
        if (response.media) {
            sendMedia(client, from, response.media);
        }
        return
    } */

    /**
    * Ver si viene de un paso anterior
    * Aqui podemos ir agregando más pasos
    * a tu gusto!
    */

/*     const lastStep = await lastTrigger(from) || null;
    if (lastStep) {
        const response = await responseMessages(lastStep)
        await sendMessage(client, from, response.replyMessage);
    }
 */
    /**
     * Respondemos al primero paso si encuentra palabras clave
     */
/*     const step = await getMessages(message);
    if (step) {
        const response = await responseMessages(step);
        await sendMessage(client, from, response.replyMessage, response.trigger);
        if(response.hasOwnProperty('actions')){
            const { actions } = response;
            await sendMessageButton(client, from, null, actions);
            return
        }

        if (!response.delay && response.media) {
            sendMedia(client, from, response.media);
        }
        if (response.delay && response.media) {
            setTimeout(() => {
                sendMedia(client, from, response.media);
            }, response.delay)
        }
        return
    } */
    //Si quieres tener un mensaje por defecto
/*     if (process.env.DEFAULT_MESSAGE === 'true') {
        const response = await responseMessages('DEFAULT')
        await sendMessage(client, from, response.replyMessage, response.trigger);
        if(response.hasOwnProperty('actions')){
            const { actions } = response;
            await sendMessageButton(client, from, null, actions);
        }
        return} */
});

/**
 * Revisamos si tenemos credenciales guardadas para inciar sessio
 * este paso evita volver a escanear el QRCODE
 */
const withSession = () => {
    console.log(`Validando session con Whatsapp...`)
    sessionData = require(SESSION_FILE_PATH);
    client = new Client(createClient(sessionData,true));

    client.on('ready', () => {
        connectionReady()
        listenMessage()
        loadRoutes(client);
        socketEvents.sendStatus()
    });

    client.on('auth_failure', () => connectionLost())

    client.initialize();
}

/**
 * Generamos un QRCODE para iniciar sesion
 */
const withOutSession = () => {
    console.log('No tenemos session guardada');
    console.log(['________________________',
    ].join('\n'));

    client = new Client(createClient());

    client.on('qr', qr => generateImage(qr, () => {
        qrcode.generate(qr, { small: true });
        console.log(`Ver QR http://localhost:${port}/qr`)
        socketEvents.sendQR(qr)
    }))

    client.on('ready', (a) => {
        connectionReady()
        listenMessage()
        loadRoutes(client);
        // socketEvents.sendStatus(client)
    });

    client.on('auth_failure', (e) => {
        // console.log(e)
        // connectionLost()
    });

    client.on('authenticated', (session) => {
        sessionData = session;
        if(sessionData){
            fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
                if (err) {
                    console.log(`Ocurrio un error con el archivo: `, err);
                }
            });
        }
    });

    client.initialize();
}

/**
 * Cargamos rutas de express
 */

const loadRoutes = (client) => {
    app.use('/api/', middlewareClient(client), require('./routes/api'))
}
/**
 * Revisamos si existe archivo con credenciales!
 */
(fs.existsSync(SESSION_FILE_PATH) && MULTI_DEVICE === 'false') ? withSession() : withOutSession();

/**
 * Verificamos si tienes un gesto de db
 */

if (process.env.DATABASE === 'mysql') {
    mysqlConnection.connect()
}

server.listen(port, () => {
    console.log(`El server esta listo por el puerto ${port}`);
})
checkEnvFile();

