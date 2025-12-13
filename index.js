const express = require('express');
const app = express();
const port = process.env.PORT || 5000;
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();
const route = require('./Route/Groute')
const path = require("path");

app.use(express.json());
app.use(express.urlencoded({ extended: true })); 

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
const allowedOrigins = [
  'http://localhost:3000',
  'https://tankosender-frontend.vercel.app',
  'https://tankosender-backend.onrender.com',
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: "GET,POST,PUT,DELETE,PATCH"
}));

app.use(route);

app.get('/', (req, res) => {
  res.send('Backend is running');
});


mongoose
  .connect(process.env.MONGO_URL)
  .then(() => {
    console.log('Connected to the database');
  
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Database connection error:", error.message);
  });
