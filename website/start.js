const { fork } = require('child_process');
const path = require('path');

console.log('[Start] Iniciando servidor web...');
const server = fork(path.join(__dirname, 'server.js'));

setTimeout(() => {
  console.log('[Start] Iniciando Discord listener...');
  const listener = fork(path.join(__dirname, 'discord-listener.js'));
  listener.on('exit', (code) => {
    console.log('[Start] Discord listener encerrado (código ' + code + ')');
  });
}, 3000);

server.on('exit', (code) => {
  console.log('[Start] Servidor web encerrado (código ' + code + ')');
  process.exit(code);
});

process.on('SIGINT', () => {
  server.kill();
  process.exit();
});
