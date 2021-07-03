const express = require('express');
const jsmediatags = require("jsmediatags");
const mp3Duration = require('mp3-duration');
const fs = require('fs');
const app = express();
const WebSocket = require('ws');

let initedAudio = []
let music = fs.readdirSync('music');
let i = 0
let sockets = []
let queue = []
let np = {
    file: '',
    title: '',
    artist: '',
    year: '',
    album: '',
    genre: '',
    picture: '',
    id: '',
    duration: 0,
    currentTime: 0,
}
let timeCount
let songFinish

console.log('Initializing Songs')

music.forEach(song => {
    jsmediatags.read(__dirname + '/music/' + song, {
        onSuccess: function(tag) {
            mp3Duration(__dirname + '/music/' + song, function (err, duration) {
                if (err) return console.log(err.message);
                
                let id = createID()

                console.log('Init: ' + song + ' as ' + tag.tags.title + ' - ' + tag.tags.artist + ' || ' + id)
    
                initedAudio.push({
                    file: song,
                    title: tag.tags.title,
                    artist: tag.tags.artist,
                    year: tag.tags.year,
                    album: tag.tags.album,
                    genre: tag.tags.genre,
                    picture: '/api/covers/byid/'+id,
                    id: id,
                    duration: duration
                })
    
                if(i === (music.length - 1)){
                    loadStations(initedAudio)
                }
            
                i++
            });
        },
        onError: function(error) {
            console.log('Init Error: ', error.type, error.info);
        }
    })
})

function loadStations(inited){
    initedAudio = inited

    console.log('Finished Loading Songs');

    const server = new WebSocket.Server({
        port: 8080
    }, function(){
        console.log('Loaded WebSocket For Streaming')
    });

    server.on('connection', function(socket) {
        sockets.push(socket);
        console.log('WS Connected')

        socket.send(JSON.stringify({
            id: np.id,
            time: np.currentTime
        }))

        socket.on('message', function(msg) {

        });

        socket.on('close', function() {
            sockets = sockets.filter(s => s !== socket);
        });
    });

    app.get('/api/stream/:id', async function(req, res){
        let song = inited.find(x => x.id === req.params.id)
        if(!song)return res.send('e')

        if(req.headers.range){
            console.log('Client Streaming ' + song.title + ' - ' + song.artist)
        }

        const path = './music/'+song.file;
    
        fs.stat(path, (err, stat) => {
            if (err !== null && err.code === 'ENOENT') {
                res.sendStatus(404);
                return;
            }

            const fileSize = stat.size
            const range = req.headers.range
    
            if (range) {
    
                const parts = range.replace(/bytes=/, "").split("-");
    
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : fileSize-1;
                
                const chunksize = (end-start)+1;
                const file = fs.createReadStream(path, {start, end});
                const head = {
                    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                    'Accept-Ranges': 'bytes',
                    'Content-Length': chunksize,
                    'Content-Type': 'video/mp4',
                }
                
                res.writeHead(206, head);
                file.pipe(res);
            } else {
                const head = {
                    'Content-Length': fileSize,
                    'Content-Type': 'video/mp3',
                }
    
                res.writeHead(200, head);
                fs.createReadStream(path).pipe(res);
            }
        });
    })

    app.get('/api/covers/byid/:id', async function(req, res){
        let song = inited.find(x => x.id === req.params.id)
        if(!song)return res.send('e')

        jsmediatags.read(__dirname + '/music/' + song.file, {
            onSuccess: function(tag) {
                res.json(tag)
            },
            onError: function(error) {
                console.log('Init Error: ', error.type, error.info);
            }
        })
    })

    app.get('/api/skip', async function(req, res){
        nextSong()

        res.send('ok')
    })

    if(queue.length <= 3){
        queue.push(inited[Math.floor(Math.random() * inited.length)])
    }

    setInterval(function(){
        if(queue.length <= 3){
            queue.push(inited[Math.floor(Math.random() * inited.length)])
        }
    }, 1000)

    startPlaying(inited)
}

function startPlaying(inited){
    setTimeout(function(){
        console.log('Started AutoDJ')

        nextSong()
    }, 250)
}

function nextSong(){
    let song = queue[0]
    let time = 0
    queue.shift()

    if(timeCount){
        clearInterval(timeCount)
    }

    if(songFinish){
        clearInterval(songFinish)
    }

    sockets.forEach(s => s.send(JSON.stringify({
        id: song.id,
        time: 0
    })));

    timeCount = setInterval(function(){
        time = time + 0.25

        np = {
            file: song.file,
            title: song.title,
            artist: song.artist,
            year: song.year,
            album: song.album,
            genre: song.genre,
            picture: song.picture,
            id: song.id,
            duration: song.duration,
            currentTime: time,
        }

        console.clear()

        let bar = ['-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']
        let pos = Math.floor((time / song.duration) * bar.length)
        bar[pos] = 'o'

        console.log('Now Playing:\n\n' + song.title + ' - ' + song.artist + '\n' + bar.join(''))
    }, 250)

    songFinish = setTimeout(function(){
        nextSong()
    }, song.duration * 1000)
}

app.get('/api', async function(req, res){
    res.json(np)
})

app.get('/radio', async function(req, res){
    res.sendFile(__dirname + '/radio.html')
})

app.get('/panel', async function(req, res){
    
})

app.get('/panel/login', async function(req, res){
    res.render('panel/login.ejs')
})

app.listen(80)

function createID() {
    var characters = [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "0"
    ];
    var template = "############";
    var create = "";
  
    template.split("").forEach(char => {
      create =
        create + characters[Math.floor(Math.random() * characters.length + 0)];
    });
  
    return create;
}