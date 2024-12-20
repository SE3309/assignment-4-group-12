const mysql = require("mysql2");
const cors = require("cors");
const express = require("express");
const path = require("path");
const OpenAI = require("openai");
const app = express();
app.use(cors());
app.use(express.json());
require("dotenv").config();

// i know there's a typo in the db name, i cant change it locally so fuck it
const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "password",
  database: "videogamereccomender",
});

// connect to openrouter
const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPEN_ROUTER_API_KEY,
});

async function isAdmin(user_id) {
  return new Promise((resolve, reject) => {
    const query = "SELECT * FROM Admin WHERE admin_id = ?";

    connection.query(query, [user_id], (err, results) => {
      if (err) {
        console.error("Error checking admin status:", err.stack);
        reject(err);
        return;
      }

      // If we found a matching admin_id, the user is an admin
      resolve(results.length > 0);
    });
  });
}

connection.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL:", err.stack);
    return;
  }
  console.log("Connected to MySQL as ID", connection.threadId);
});

app.use(express.static(path.join(__dirname, "../client")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

// endpoint to create a new user
app.post("/register", (req, res) => {
  const { username, password, age } = req.body;
  const registrationDate = new Date()
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");

  // Get the maximum user_id instead of counting rows
  const maxIdQuery = "SELECT MAX(user_id) AS max_id FROM User";
  connection.query(maxIdQuery, (err, results) => {
    if (err) {
      console.error("Error getting max user ID:", err.stack);
      res.status(500).send(`Error registering user: ${err.message}`);
      return;
    }

    const userId = (results[0].max_id || 0) + 1;

    const insertQuery =
      "INSERT INTO User (user_id, username, registration_date, age, password) VALUES (?, ?, ?, ?, ?)";
    connection.query(
      insertQuery,
      [userId, username, registrationDate, age, password],
      (err, results) => {
        if (err) {
          console.error("Error inserting user:", err.stack);
          res.status(500).send(`Error registering user: ${err.message}`);
          return;
        }
        res.status(201).send("User registered successfully");
      }
    );
  });
});

// endpoint to log in an existing user
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  // Check if username and password are provided
  if (!username || !password) {
    return res
      .status(400)
      .json({ success: false, message: "Missing credentials" });
  }

  // Query the database
  const query = "SELECT user_id FROM user WHERE username = ? AND password = ?";
  connection.query(query, [username, password], (err, results) => {
    if (err) {
      console.error("Error querying database:", err);
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }

    if (results.length > 0) {
      // User authenticated
      res.json({
        success: true,
        message: "Login successful",
        user_id: results[0].user_id,
      });
    } else {
      // Invalid credentials
      res.status(401).json({
        success: false,
        message: "Invalid username or password",
      });
    }
  });
});

// endpoint to retrieve all users in the db
app.get("/users", (req, res) => {
  const query = "SELECT * FROM User";
  connection.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching users:", err.stack);
      res.status(500).send("Error fetching users");
      return;
    }
    res.status(200).json(results);
  });
});

// endpoint to update user information
app.put("/users/:userId", (req, res) => {
  const userId = req.params.userId;
  const { username, age, password } = req.body;

  // First check if user exists
  const checkUserQuery = "SELECT * FROM User WHERE user_id = ?";
  connection.query(checkUserQuery, [userId], (err, results) => {
    if (err) {
      console.error("Error checking user:", err.stack);
      return res.status(500).send(`Error updating user: ${err.message}`);
    }

    if (results.length === 0) {
      return res.status(404).send("User not found");
    }

    // Build dynamic update query based on provided fields
    let updateQuery = "UPDATE User SET ";
    const updateValues = [];

    if (username) {
      updateQuery += "username = ?, ";
      updateValues.push(username);
    }
    if (age) {
      updateQuery += "age = ?, ";
      updateValues.push(age);
    }
    if (password) {
      updateQuery += "password = ?, ";
      updateValues.push(password);
    }

    // Remove trailing comma and space
    updateQuery = updateQuery.slice(0, -2);
    updateQuery += " WHERE user_id = ?";
    updateValues.push(userId);

    // Execute update if there are fields to update
    if (updateValues.length > 1) {
      connection.query(updateQuery, updateValues, (err, results) => {
        if (err) {
          console.error("Error updating user:", err.stack);
          return res.status(500).send(`Error updating user: ${err.message}`);
        }
        res.status(200).send("User updated successfully");
      });
    } else {
      res.status(400).send("No fields to update provided");
    }
  });
});

// endpoint to get all reviews by a user
app.get("/users/:userId/reviews", async (req, res) => {
  const { userId } = req.params;
  const query = `
    SELECT 
      r.rating_id,
      r.score,
      r.review,
      r.rating_date,
      v.title,
      v.platform,
      v.publisher
    FROM Rating r
    JOIN VideoGame v ON r.game_id = v.game_id
    WHERE r.user_id = ? AND r.review IS NOT NULL AND r.review != ''
    ORDER BY r.rating_date DESC`;

  try {
    const results = await new Promise((resolve, reject) => {
      connection.query(query, [userId], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    res.json(results);
  } catch (err) {
    console.error("Error fetching user reviews:", err);
    res.status(500).send("Error fetching reviews");
  }
});

// endpoint to show all user's activity
app.get("/users/:userId/activity", (req, res) => {
  const userId = req.params.userId;

  // Check if user exists
  const checkUserQuery = "SELECT * FROM User WHERE user_id = ?";
  connection.query(checkUserQuery, [userId], (err, userResults) => {
    if (err) {
      console.error("Error checking user:", err.stack);
      return res
        .status(500)
        .send(`Error fetching user activity: ${err.message}`);
    }

    if (userResults.length === 0) {
      return res.status(404).send("User not found");
    }

    // Get ratings summary
    const ratingsQuery = `
      SELECT 
        COUNT(*) as total_ratings,
        AVG(score) as average_rating
      FROM Rating 
      WHERE user_id = ?`;

    // Get wishlist count
    const wishlistQuery = `
      SELECT COUNT(*) as total_wishlist
      FROM Wishlist 
      WHERE user_id = ?`;

    // Execute both queries in parallel
    Promise.all([
      new Promise((resolve, reject) => {
        connection.query(ratingsQuery, [userId], (err, ratingResults) => {
          if (err) reject(err);
          else resolve(ratingResults[0]);
        });
      }),
      new Promise((resolve, reject) => {
        connection.query(wishlistQuery, [userId], (err, wishlistResults) => {
          if (err) reject(err);
          else resolve(wishlistResults[0]);
        });
      }),
    ])
      .then(([ratingStats, wishlistStats]) => {
        // Create activity summary with default values for new users
        const activitySummary = {
          user_id: userId,
          username: userResults[0].username,
          total_ratings: ratingStats.total_ratings || 0,
          average_rating: ratingStats.average_rating || null,
          total_wishlist_items: wishlistStats.total_wishlist || 0,
        };
        res.status(200).json(activitySummary);
      })
      .catch((err) => {
        console.error("Error fetching activity:", err);
        res.status(500).send(`Error fetching activity: ${err.message}`);
      });
  });
});

// endpoint to retrieve a user's wishlist
app.get("/wishlist/:userId", (req, res) => {
  const userId = req.params.userId;
  const query = "SELECT * FROM Wishlist WHERE user_id = ?";
  connection.query(query, [userId], (err, results) => {
    if (err) {
      console.error("Error fetching wishlist:", err.stack);
      res.status(500).send("Error fetching wishlist");
      return;
    }
    res.status(200).json(results);
  });
});

// endpoint to add a game to a user's wishlist
app.post("/wishlist/:userId", (req, res) => {
  const userId = req.params.userId;
  const { game_id, comment } = req.body; // Extract comment from request body

  // First verify user exists
  const checkUserQuery = "SELECT * FROM User WHERE user_id = ?";
  connection.query(checkUserQuery, [userId], (err, results) => {
    if (err) {
      console.error("Error checking user:", err.stack);
      return res.status(500).send(`Error adding to wishlist: ${err.message}`);
    }

    if (results.length === 0) {
      return res.status(404).send("User not found");
    }

    // Check if game already in wishlist
    const checkWishlistQuery =
      "SELECT * FROM Wishlist WHERE user_id = ? AND game_id = ?";
    connection.query(checkWishlistQuery, [userId, game_id], (err, results) => {
      if (err) {
        console.error("Error checking wishlist:", err.stack);
        return res.status(500).send(`Error checking wishlist: ${err.message}`);
      }

      if (results.length > 0) {
        return res.status(409).send("Game already in wishlist");
      }

      // Add to wishlist with comment
      const insertQuery =
        "INSERT INTO Wishlist (user_id, game_id, comments) VALUES (?, ?, ?)";
      connection.query(
        insertQuery,
        [userId, game_id, comment || null],
        (err, results) => {
          if (err) {
            console.error("Error adding to wishlist:", err.stack);
            return res
              .status(500)
              .send(`Error adding to wishlist: ${err.message}`);
          }

          res.status(201).send("Game added to wishlist successfully");
        }
      );
    });
  });
});

// endpoint to delete a game from user's wishlist
app.delete("/wishlist/:userId/:gameId", (req, res) => {
  const { userId, gameId } = req.params;

  const query = "DELETE FROM Wishlist WHERE user_id = ? AND game_id = ?";
  connection.query(query, [userId, gameId], (err, results) => {
    if (err) {
      console.error("Error deleting from wishlist:", err);
      return res.status(500).send("Error deleting from wishlist");
    }
    if (results.affectedRows === 0) {
      return res.status(404).send("Game not found in wishlist");
    }
    res.status(200).send("Game removed from wishlist");
  });
});

// endpoint to find a videogame based on id
app.get("/videogame/search/:id", (req, res) => {
  const { id } = req.params;
  const query = "SELECT * FROM VideoGame WHERE game_id = ?";
  connection.query(query, [id], (err, results) => {
    if (err) {
      console.error("Error while fetching the game:", err);
      res.status(500).send("Error while fetching the game");
    } else if (results.length === 0) {
      res.status(404).send("Game not found");
    } else {
      res.status(200).json(results[0]); // Return the first matching result
    }
  });
});

// endpoint to retrieve all video games
app.get("/videogame/all", (req, res) => {
  const query = `
    SELECT 
      v.game_id,
      v.title,
      v.platform,
      v.publisher,
      v.release_date,
      AVG(r.score) as average_rating,
      COUNT(r.rating_id) as number_of_ratings
    FROM VideoGame v
    LEFT JOIN Rating r ON v.game_id = r.game_id
    GROUP BY v.game_id, v.title, v.platform, v.publisher, v.release_date
    ORDER BY v.title`;

  connection.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching all games:", err);
      return res.status(500).send("Error fetching all games");
    }
    res.status(200).json(results);
  });
});

// endpoint to get most popular games
app.get("/videogame/popular", (req, res) => {
  // number of results to return
  const { n } = req.body;

  // Validate n
  const limit = n || 10; // Default to 10 if not specified

  const query = `
    SELECT 
      v.game_id,
      v.title,
      v.platform,
      v.publisher,
      v.release_date,
      AVG(r.score) as average_rating,
      COUNT(r.rating_id) as number_of_ratings
    FROM VideoGame v
    LEFT JOIN Rating r ON v.game_id = r.game_id
    GROUP BY v.game_id, v.title, v.platform, v.publisher, v.release_date
    HAVING number_of_ratings > 0
    ORDER BY average_rating DESC, number_of_ratings DESC
    LIMIT ?`;

  connection.query(query, [limit], (err, results) => {
    if (err) {
      console.error("Error fetching popular games:", err);
      return res.status(500).send("Error fetching popular games");
    }

    if (results.length === 0) {
      return res.status(404).send("No games found");
    }

    res.status(200).json(results);
  });
});

// endpoint to search video games
app.get("/videogame/search", (req, res) => {
  const { query } = req.query;

  const searchQuery = `
    SELECT 
      v.game_id,
      v.title,
      v.platform,
      v.publisher,
      v.release_date,
      AVG(r.score) as average_rating,
      COUNT(r.rating_id) as number_of_ratings
    FROM VideoGame v
    LEFT JOIN Rating r ON v.game_id = r.game_id
    WHERE 
      v.title LIKE ? OR
      v.platform LIKE ? OR
      v.publisher LIKE ?
    GROUP BY v.game_id, v.title, v.platform, v.publisher, v.release_date
    ORDER BY v.title`;

  const searchTerm = `%${query}%`;

  connection.query(
    searchQuery,
    [searchTerm, searchTerm, searchTerm],
    (err, results) => {
      if (err) {
        console.error("Error searching games:", err);
        return res.status(500).send("Error searching games");
      }
      res.status(200).json(results);
    }
  );
});

// endpoint to get games with rating >= specified score
app.get("/videogame/byrating/:score", (req, res) => {
  const { score } = req.params;
  const query = `
    SELECT 
      v.game_id,
      v.title,
      v.platform,
      v.publisher,
      v.release_date,
      AVG(r.score) as average_rating,
      COUNT(r.rating_id) as number_of_ratings
    FROM VideoGame v
    INNER JOIN Rating r ON v.game_id = r.game_id
    GROUP BY v.game_id, v.title, v.platform, v.publisher, v.release_date
    HAVING AVG(r.score) >= ?
    ORDER BY average_rating DESC`;

  connection.query(query, [score], (err, results) => {
    if (err) {
      console.error("Error fetching games by rating:", err);
      res.status(500).send("Error fetching games by rating");
    } else if (results.length === 0) {
      res.status(404).send("No games found with rating >= " + score);
    } else {
      res.status(200).json(results);
    }
  });
});

// admin endpoint to delete a user
app.delete("/admin/users/:userId", (req, res) => {
  const { userId } = req.params;
  const { admin_id } = req.body;

  // check if user is an admin
  isAdmin(admin_id)
    .then((isAdminUser) => {
      if (!isAdminUser) {
        return res.status(401).send("Unauthorized");
      }

      // check if user exists
      const checkUserQuery = "SELECT * FROM User WHERE user_id = ?";
      connection.query(checkUserQuery, [userId], (err, results) => {
        if (err) {
          console.error("Error checking user:", err.stack);
          return res.status(500).send(`Error deleting user: ${err.message}`);
        }

        if (results.length === 0) {
          return res.status(404).send("User not found");
        }

        // delete user
        const deleteQuery = "DELETE FROM User WHERE user_id = ?";
        connection.query(deleteQuery, [userId], (err, results) => {
          if (err) {
            console.error("Error deleting user:", err.stack);
            return res.status(500).send(`Error deleting user: ${err.message}`);
          }
          res.status(200).send("User deleted successfully");
        });
      });
    })
    .catch((err) => {
      console.error("Error checking admin status:", err);
      res.status(500).send("Error checking admin status");
    });
});

// admin endpoint to check if a user is an admin
app.get("/admin/check/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const isAdminUser = await isAdmin(userId);
    res.json({ isAdmin: isAdminUser });
  } catch (err) {
    console.error("Error checking admin status:", err);
    res.status(500).send("Error checking admin status");
  }
});

// get stored recommendations
app.get("/recommendations/:userId/stored", async (req, res) => {
  const userId = req.params.userId;
  const minRating = req.query.minRating || 0;

  const query = `
    SELECT r.recommendation_id, r.reason, v.*, 
           COALESCE(AVG(rt.score), 0) as average_rating
    FROM Recommendation r
    JOIN VideoGame v ON r.game_id = v.game_id
    LEFT JOIN Rating rt ON v.game_id = rt.game_id
    WHERE r.user_id = ?
    GROUP BY r.recommendation_id, r.reason, v.game_id, v.title, v.platform, v.publisher, v.release_date
    HAVING COALESCE(AVG(rt.score), 0) >= ?
    ORDER BY average_rating DESC`;

  try {
    const results = await new Promise((resolve, reject) => {
      connection.query(query, [userId, minRating], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });

    res.json(results);
  } catch (err) {
    console.error("Error fetching stored recommendations:", err);
    res.status(500).send("Error fetching recommendations");
  }
});

// generate new recommendations
app.post("/recommendations/:userId/generate", async (req, res) => {
  const userId = req.params.userId;

  try {
    // get user's wishlist with genres and ratings
    const wishlistQuery = `
      SELECT v.*, AVG(r.score) as average_rating,
      COUNT(r.rating_id) as rating_count
      FROM VideoGame v
      JOIN Wishlist w ON v.game_id = w.game_id
      LEFT JOIN Rating r ON v.game_id = r.game_id
      WHERE w.user_id = ?
      GROUP BY v.game_id`;

    // grabs 20 random games (token limitation doesn't allow passing all)
    const allGamesQuery = `
      SELECT v.*, 
      AVG(r.score) as average_rating,
      COUNT(r.rating_id) as rating_count
      FROM VideoGame v
      LEFT JOIN Rating r ON v.game_id = r.game_id
      WHERE v.game_id NOT IN (
        SELECT game_id FROM Wishlist WHERE user_id = ?
      )
      AND v.game_id NOT IN (
        SELECT game_id FROM Recommendation WHERE user_id = ?
      )
      GROUP BY v.game_id
      HAVING average_rating >= 3 OR rating_count = 0
      ORDER BY RAND()
      LIMIT 20`;

    const [wishlistGames, allGames] = await Promise.all([
      new Promise((resolve, reject) => {
        connection.query(wishlistQuery, [userId], (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      }),
      new Promise((resolve, reject) => {
        connection.query(allGamesQuery, [userId, userId], (err, results) => {
          if (err) reject(err);
          else resolve(results);
        });
      }),
    ]);

    const prompt = `You are a video game recommendation system. Below are games from user's wishlist and available games to recommend from. You must return ONLY a JSON array with exactly 5 recommendations.

Wishlist games:
${JSON.stringify(
  wishlistGames.map((g) => ({
    title: g.title,
    platform: g.platform,
    publisher: g.publisher,
    rating: g.average_rating,
  }))
)}

Available games:
${JSON.stringify(
  allGames.map((g) => ({
    title: g.title,
    platform: g.platform,
    publisher: g.publisher,
    rating: g.average_rating,
  }))
)}

Rules:
1. Match games based on platforms and publishers from wishlist
2. Consider rating patterns
3. Ensure variety in recommendations
4. Use exact titles from available games list
5. For each recommendation, provide detailed reasoning that references specific games from their wishlist
6. Each reason should explain why this game matches their interests based on platform, publisher, or style
7. Return ONLY valid JSON array with 5 items, each containing a title and detailed reason`;

    const completion = await openrouter.chat.completions.create({
      model: "meta-llama/llama-3.2-3b-instruct:free",
      messages: [
        {
          role: "system",
          content:
            "You are a video game recommendation system that MUST ONLY return a JSON array of exactly 5 recommendations. " +
            "Each recommendation must have exactly two fields: 'title' (matching a game title from the available list) and 'reason' (a detailed explanation referencing games from their wishlist). " +
            "Your entire response must be valid JSON. Do not include any other text or explanations outside the JSON structure. " +
            'Example format: [{"title":"Game Name","reason":"Recommended because you enjoyed [specific game] - this game shares similar [specific features]"}]',
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
    });

    let recommendations = JSON.parse(completion.choices[0].message.content);

    // Get max recommendation_id
    const maxIdQuery =
      "SELECT MAX(recommendation_id) as max_id FROM Recommendation";
    const maxId = await new Promise((resolve, reject) => {
      connection.query(maxIdQuery, (err, results) => {
        if (err) reject(err);
        else resolve(results[0].max_id || 0);
      });
    });

    // Store new recommendations
    let nextId = maxId + 1;
    const insertPromises = recommendations
      .map(async (rec) => {
        const game = allGames.find((g) => g.title === rec.title);
        if (!game) return null;

        const insertQuery = `
          INSERT INTO Recommendation 
          (recommendation_id, user_id, game_id, reason) 
          VALUES (?, ?, ?, ?)`;

        return new Promise((resolve, reject) => {
          connection.query(
            insertQuery,
            [nextId++, userId, game.game_id, rec.reason],
            (err, results) => {
              if (err) {
                console.error("Error inserting recommendation:", err);
                resolve(null);
              } else {
                resolve({ ...game, reason: rec.reason });
              }
            }
          );
        });
      })
      .filter((p) => p !== null);

    const storedRecommendations = (await Promise.all(insertPromises)).filter(
      (rec) => rec !== null
    );
    res.json(storedRecommendations);
  } catch (err) {
    console.error("Error generating recommendations:", err);
    res.status(500).send("Error generating recommendations");
  }
});

// endpoint to delete a recommendation
app.delete("/recommendations/:userId/:recommendationId", async (req, res) => {
  const { userId, recommendationId } = req.params;

  const query =
    "DELETE FROM Recommendation WHERE recommendation_id = ? AND user_id = ?";
  try {
    await new Promise((resolve, reject) => {
      connection.query(query, [recommendationId, userId], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    res.status(200).send("Recommendation deleted successfully");
  } catch (err) {
    console.error("Error deleting recommendation:", err);
    res.status(500).send("Error deleting recommendation");
  }
});

// endpoint to add or update a game rating
app.post("/rating/:userId/:gameId", async (req, res) => {
  const { userId, gameId } = req.params;
  const { score, review } = req.body;
  const ratingDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format

  try {
    // Get the maximum rating_id
    const maxIdQuery = "SELECT MAX(rating_id) as max_id FROM Rating";
    const maxId = await new Promise((resolve, reject) => {
      connection.query(maxIdQuery, (err, results) => {
        if (err) reject(err);
        else resolve(results[0].max_id || 0);
      });
    });

    // Check if rating already exists
    const checkQuery =
      "SELECT rating_id FROM Rating WHERE user_id = ? AND game_id = ?";
    const existingRating = await new Promise((resolve, reject) => {
      connection.query(checkQuery, [userId, gameId], (err, results) => {
        if (err) reject(err);
        else resolve(results[0]);
      });
    });

    if (existingRating) {
      // Update existing rating
      const updateQuery =
        "UPDATE Rating SET score = ?, review = ?, rating_date = ? WHERE rating_id = ?";
      await new Promise((resolve, reject) => {
        connection.query(
          updateQuery,
          [score, review, ratingDate, existingRating.rating_id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      res.status(200).send("Rating updated successfully");
    } else {
      // Insert new rating
      const insertQuery =
        "INSERT INTO Rating (rating_id, user_id, game_id, score, review, rating_date) VALUES (?, ?, ?, ?, ?, ?)";
      await new Promise((resolve, reject) => {
        connection.query(
          insertQuery,
          [maxId + 1, userId, gameId, score, review, ratingDate],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      res.status(201).send("Rating added successfully");
    }
  } catch (err) {
    console.error("Error managing rating:", err);
    res.status(500).send("Error managing rating");
  }
});

// endpoint to get all ratings for a game
app.get("/ratings/game/:gameId", async (req, res) => {
  const { gameId } = req.params;
  const query = `
    SELECT 
      r.rating_id,
      r.score,
      r.review,
      r.rating_date,
      u.username
    FROM Rating r
    JOIN User u ON r.user_id = u.user_id
    WHERE r.game_id = ?
    ORDER BY r.rating_date DESC`;

  try {
    const results = await new Promise((resolve, reject) => {
      connection.query(query, [gameId], (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
    res.json(results);
  } catch (err) {
    console.error("Error fetching game ratings:", err);
    res.status(500).send("Error fetching game ratings");
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
