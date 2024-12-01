const mysql = require("mysql2");
const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());

const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "70Dekkpoqy!",
  database: "videogamereccomender",
});

connection.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err.stack);
    return;
  }
  console.log("Connected to MySQL as ID", connection.threadId);
});

app.post("/api/rategame/:user_id", (req, res) => {
  const { user_id } = req.params;
  const { game_id, score, review, rating_date } = req.body;

  // Query to get the maximum rating_id
  connection.query("SELECT MAX(rating_id) AS max_id FROM rating", (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error retrieving ratings");
      return;
    }

    const maxId = results[0].max_id || 0;
    const newRatingId = maxId + 1;

    // Insert the new rating with the incremented rating_id
    connection.query(
      "INSERT INTO rating (rating_id, user_id, game_id, review, score, rating_date) VALUES (?, ?, ?, ?, ?, ?)",
      [newRatingId, user_id, game_id, review, score, rating_date],
      (err, results) => {
        if (err) {
          console.error(err);
          res.status(500).send("Error rating game");
        } else {
          res.status(201).send("Game rated successfully");
        }
      }
    );
  });
});
 
app.put("/api/rategame/:user_id", (req, res) => {
  const { user_id } = req.params;
  const { game_id, score, review, rating_date } = req.body;

  connection.query(
    "UPDATE rating SET review = ?, score = ?, rating_date = ? WHERE user_id = ? AND game_id = ?",
    [review, score, rating_date, user_id, game_id],
    (err, results) => {
      if (err) {
        console.error(err);
        res.status(500).send("Error updating rating");
      } else {
        res.status(200).send("Rating updated successfully");
      }
    }
  );
}
);
app.delete("/api/rategame/:user_id", (req, res) => {
  const { user_id } = req.params;
  const { game_id } = req.body;

  connection.query(
    "DELETE FROM rating WHERE user_id = ? AND game_id = ?",
    [user_id, game_id],
    (err, results) => {
      if (err) {
        console.error(err);
        res.status(500).send("Error deleting rating");
      } else {
        res.status(200).send("Rating deleted successfully");
      }
    }
  );
});

app.get("/api/search/:game", (req, res) => {//search for games
  const { game } = req.params;

  connection.query(
    "SELECT * FROM VideoGame WHERE title LIKE ?",
    [`%${game}%`],
    (err, results) => {
      if (err) {
        console.error(err);
        res.status(500).send("Error searching for games");
      } else {
        res.status(200).json(results);
      }
    }
  );
});

app.listen(3000, () => {
  console.log(`Server running on port $`);
});
