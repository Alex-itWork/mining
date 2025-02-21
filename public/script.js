let socket = null;
let isMining = false;
let userId = null;

// Подключение к WebSocket
function connectToServer(token) {
  socket = new WebSocket('ws://localhost:3000');

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'auth', token }));
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'update') {
      document.getElementById("total-hashrate").textContent = `Общий хешрейт: ${data.totalHashrate} H/s`;
    }
  };

  socket.onclose = () => {
    console.log('Соединение закрыто');
  };
}

// Регистрация
async function register() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const response = await fetch('http://localhost:3000/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const result = await response.json();
  alert(result.message);
}

// Вход
async function login() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const response = await fetch('http://localhost:3000/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const result = await response.json();
  if (result.token) {
    connectToServer(result.token);
    document.getElementById("auth-form").classList.add("hidden");
    document.getElementById("mining-panel").classList.remove("hidden");
  } else {
    alert(result.error);
  }
}

// Начать майнинг
function startMining() {
  if (!isMining) {
    isMining = true;
    document.getElementById("start-btn").disabled = true;
    document.getElementById("stop-btn").disabled = false;
    document.getElementById("status").textContent = "Активен";

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'startMining' }));
    }
  }
}

// Остановить майнинг
function stopMining() {
  if (isMining) {
    isMining = false;
    document.getElementById("start-btn").disabled = false;
    document.getElementById("stop-btn").disabled = true;
    document.getElementById("status").textContent = "Не активен";

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'stopMining' }));
    }
  }
}

// Вывод средств
function withdraw() {
  const walletAddress = document.getElementById("wallet-address").value;
  if (walletAddress) {
    alert(`Вывод средств на адрес: ${walletAddress}`);
  } else {
    alert("Введите действительный адрес кошелька!");
  }
}