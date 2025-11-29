const express = require('express');
const app = express();
const port = process.env.PORT || 5000;
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();
const route = require('./Route/Groute')

app.use(express.json());
app.use(express.urlencoded({ extended: true })); 


const allowedOrigins = [
  'http://localhost:3000',
  'https://tankosender-frontend.vercel.app/',
  'https://tankosender-backend.onrender.com/',
   
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true, 
    methods: "GET,POST,PUT,DELETE",// if you need to send cookies or auth headers
}));

app.use(route)



app.get('/', (req, res) => {
  res.send('Backend is running');
});

   mongoose
  .connect(process.env.MONGO_URL) 
  
  .then(() => {
    console.log('connected the to database')
  
    app.listen(port, () => {
      console.log(`HTTPS server running on https://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.log(error);
    console.error("Database connection error:", error.message);
  });