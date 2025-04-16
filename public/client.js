// public/client.js
const socket = io();
let gameId, hostId;

const views = ['home','lobby','answer','status','submitted'];
function show(v) {
  views.forEach(id => document.getElementById(id).style.display = id === v ? 'block' : 'none');
}

const createBtn        = document.getElementById('create');
const createName       = document.getElementById('createName');
const joinBtn          = document.getElementById('join');
const joinName         = document.getElementById('joinName');
const joinId           = document.getElementById('joinId');

// when you hit Enter in the “create name” field, fire the Create button
createName.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    createBtn.click();
  }
});

// when you hit Enter in the GameID field, move focus to the Name field
joinId.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    joinName.focus();
  }
});

// when you hit Enter in the Name field, fire the Join button
joinName.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    joinBtn.click();
  }
});

const gameIdEl         = document.getElementById('gameId');
const playersList      = document.getElementById('players');
const startRoundBtn    = document.getElementById('startRound');
const endGameBtn       = document.getElementById('endGameBtn');

const promptEl         = document.getElementById('prompt');
const answerBox        = document.getElementById('answerBox');
const submitAnswerBtn  = document.getElementById('submitAnswer');
const endRoundBtn      = document.getElementById('endRoundBtn');

const statusList       = document.getElementById('statusList');
const endRoundBtnStats = document.getElementById('endRoundBtnStatus');

const yourAnswerEl     = document.getElementById('yourAnswer');
const fakeQEl          = document.getElementById('fakeQ');
const realQEl          = document.getElementById('realQuestion');
const revealBtn        = document.getElementById('revealBtn');
const endRoundBtnSub   = document.getElementById('endRoundBtnSubmitted');

// error
socket.on('error', msg => alert(msg));

// Create / Join
createBtn.onclick = () => {
  const n = createName.value.trim();
  if (!n) return alert('Enter host name');
  socket.emit('createGame', { name: n });
};
socket.on('gameCreated', ({ gameId: id }) => {
  gameIdEl.innerText = id; gameId = id; show('lobby');
});

joinBtn.onclick = () => {
  const n = joinName.value.trim();
  const id = joinId.value.trim().toUpperCase();
  if (!n||!id) return alert('Enter name & ID');
  socket.emit('joinGame', { gameId: id, name: n });
};
socket.on('gameJoined', ({ gameId: id }) => {
  gameIdEl.innerText = id; gameId = id; show('lobby');
});

endGameBtn.onclick = () => {
  socket.emit('endGame', { gameId });
};

// Lobby
socket.on('updateLobby', ({ players, host }) => {
  hostId = host;
  playersList.innerHTML = Object.entries(players)
    .map(([pid,p]) => 
      `<li>${p.name}` +
      (socket.id===hostId && pid!==hostId
        ? ` <button class="kick" data-id='${pid}'>Kick</button>` : '') +
      `</li>`
    ).join('');
  startRoundBtn.style.display = socket.id===hostId ? 'block':'none';
  endGameBtn.style.display = socket.id === hostId ? 'inline-block' : 'none';
});
playersList.onclick = e => {
  if(e.target.classList.contains('kick')) {
    socket.emit('kickPlayer',{gameId,playerId:e.target.dataset.id});
  }
};
socket.on('kicked', ()=>{ alert('You have been kicked by the host!'); show('home'); });

// Start round
startRoundBtn.onclick = ()=>socket.emit('startRound',{gameId});
socket.on('roundStarted', ({ question }) => {
  promptEl.innerText = question;
  show('answer');
  endRoundBtn.style.display = socket.id===hostId ? 'inline-block' : 'none';
});

// Submit answer
submitAnswerBtn.onclick = ()=>{
  const a = answerBox.value.trim();
  if(!a) return alert('Your answer cannot be empty!');
  socket.emit('submitAnswer',{gameId,answer:a});
  show('status');
  endRoundBtnStats.style.display = socket.id===hostId ? 'inline-block' : 'none';
};

// Status update
socket.on('updateStatus',({ players })=>{
  statusList.innerHTML = Object.values(players)
    .map(p=>`<li>${p.name}: ${p.answered?'✅':'⌛'}</li>`).join('');
  endRoundBtnStats.style.display = socket.id===hostId ? 'inline-block' : 'none';
});

// All submitted
socket.on('allSubmitted',({ answer, fakeQuestion })=>{
  yourAnswerEl.innerText = `Your answer: ${answer}`;
  fakeQEl.innerText      = fakeQuestion?`Fake Q: ${fakeQuestion}`:'';
  revealBtn.style.display      = socket.id===hostId ? 'inline-block' : 'none';
  endRoundBtnSub.style.display = socket.id===hostId ? 'inline-block' : 'none';
  show('submitted');
});

// Reveal real question
revealBtn.onclick = ()=>socket.emit('revealQuestion',{gameId});
socket.on('questionRevealed',({ realQuestion })=>{
  realQEl.innerText = `Real Question: ${realQuestion}`;
});

// Round ended (all clients)
socket.on('roundEnded',()=>{
  show('lobby');
});

socket.on('gameEnded', () => {
  alert('The host has ended the game.');
  show('home');
});

// End round handler
function doEnd() {
  socket.emit('endRound',{ gameId });
}
endRoundBtn.onclick = doEnd;
endRoundBtnStats.onclick = doEnd;
endRoundBtnSub.onclick = doEnd;