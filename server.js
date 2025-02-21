const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Создаем Express приложение
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Подключаемся к базе данных SQLite
const db = new sqlite3.Database('./db/users.db', (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the SQLite database.');
});

// Создаем таблицу пользователей
db.run(
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    balance REAL DEFAULT 0,
    hashrate INTEGER DEFAULT 0
  )`,
  (err) => {
    if (err) {
      console.error(err.message);
    }
  }
);

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Регистрация пользователя
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, hashedPassword],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ message: 'User registered successfully!' });
      }
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Авторизация пользователя
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.json({ token });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket-соединение
wss.on('connection', (ws) => {
  let userId = null;
  let totalHashrate = 0;

  // Обработка сообщений от клиента
  ws.on('message', (message) => {
    const data = JSON.parse(message);

    if (data.type === 'auth') {
      const { token } = data;
      jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
          ws.send(JSON.stringify({ type: 'error', message: 'Authentication failed' }));
          ws.close();
          return;
        }
        userId = decoded.userId;
      });
    } else if (data.type === 'startMining') {
      db.run('UPDATE users SET hashrate = ? WHERE id = ?', [10, userId], (err) => {
        if (err) {
          console.error(err.message);
        }
        updateTotalHashrate();
      });
    } else if (data.type === 'stopMining') {
      db.run('UPDATE users SET hashrate = 0 WHERE id = ?', [userId], (err) => {
        if (err) {
          console.error(err.message);
        }
        updateTotalHashrate();
      });
    }
  });

  // Закрытие соединения
  ws.on('close', () => {
    if (userId) {
      db.run('UPDATE users SET hashrate = 0 WHERE id = ?', [userId], (err) => {
        if (err) {
          console.error(err.message);
        }
        updateTotalHashrate();
      });
    }
  });
});

// Функция для обновления общего хешрейта
function updateTotalHashrate() {
  db.all('SELECT hashrate FROM users', (err, rows) => {
    if (err) {
      console.error(err.message);
      return;
    }

    totalHashrate = rows.reduce((sum, row) => sum + row.hashrate, 0);

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'update', totalHashrate }));
      }
    });
  });
}

// Обновление балансов каждую секунду
setInterval(() => {
  db.all('SELECT id, hashrate FROM users', (err, rows) => {
    if (err) {
      console.error(err.message);
      return;
    }

    const rewardPerHash = 0.00000001; // Награда за один хеш

    rows.forEach((row) => {
      if (row.hashrate > 0) {
        const reward = (row.hashrate / totalHashrate) * rewardPerHash;
        db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [reward, row.id], (err) => {
          if (err) {
            console.error(err.message);
          }
        });
      }
    });
  });
}, 1000);

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});