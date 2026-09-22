# Content-Based Movie Recommender

A single-page web application that recommends movies using **content-based filtering**. You pick movies you like, the app builds a *user profile vector* (the average of their genre vectors) and scores every other movie with **cosine similarity** to suggest the titles most like your taste.

Built with vanilla HTML, CSS, and JavaScript — no frameworks, no build step.

## Features

- **Profile-based recommendations** — the profile is the average genre vector of all movies you've watched.
- **Cosine similarity** — candidates are ranked by `dot(A, B) / (||A|| · ||B||)` against your profile.
- **Up to 3 movies per selection** — each of the three dropdowns includes a "None" option, and you can keep adding movies at any time.
- **Automatic recalculation** — every time you add a movie, the profile is rebuilt and the Top-5 recommendations refresh automatically.
- **Top-5 list with pagination** — "Show Next Top-5" walks through the ranked list (1–5, 6–10, 11–15, …) until you watch/add something new, which resets the window.
- **History persistence** — with history enabled, your watched movies are saved in `localStorage` and reused on the next visit; disable it to stop saving and ignore previously stored data (status shown via a chip).
- **No repeats** — already-watched movies never reappear in the recommendations.
- **Reset** — deletes all saved history and starts from scratch.

## Project Structure

```
├── index.html   # Page structure (dropdowns, buttons, result area)
├── style.css    # Layout and styling
├── data.js      # Data module: loads & parses u.item and u.data
├── script.js    # UI + logic module: profile vector, cosine similarity, UI
├── u.item       # Movie metadata (id, title, 19 genre flags)
└── u.data       # 100,000 ratings (userID, itemID, rating, timestamp)
```

## Getting Started

### Prerequisites

A modern browser with `fetch()` support. The app reads `u.item` and `u.data` via `fetch()`, which requires serving the files over HTTP — opening `index.html` directly from the filesystem won't work.

### Run locally

Using Python 3:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>.

Or with Node.js:

```bash
npx serve .
```

### Usage

1. Pick up to 3 movies from the dropdowns (use "None" to leave a slot empty) and click **Add to Profile**.
2. The Top-5 recommendations appear immediately, ranked by cosine similarity to your profile.
3. Click **Show Next Top-5** to paginate through the ranked list without changing your profile.
4. Keep adding movies to refine the profile — recommendations update automatically.
5. Toggle **history** to save your watched list between sessions.
6. Click **Reset** to delete the history and start over.

## How It Works

1. **Data loading** (`data.js`): `loadData()` fetches `u.item` and `u.data`, and the parsers produce:

   - `movies` — `{ id, title, genres, vector }` where `vector` is the 19-dimensional genre bit-vector from `u.item`.
   - `ratings` — `{ userId, itemId, rating, timestamp }`.

2. **Profile vector** (`script.js`): for every watched movie, add its genre vector, then divide by the number of watched movies. The result is a "taste vector."

3. **Scoring**: every movie that isn't already watched is compared to the profile vector using the cosine similarity formula. Higher is more similar.

4. **Output**: the sorted list is displayed in pages of 5, showing the rank, title, and match percentage.

## Data Source

The `u.item` and `u.data` files come from the [MovieLens 100K dataset](https://grouplens.org/datasets/movielens/100k/):

- 1,682 movies with genre flags (Action, Adventure, ..., Western)
- 100,000 ratings from 943 users on a 1–5 scale

## License

This project is for educational purposes. The MovieLens dataset is made available by GroupLens for research and educational use — see the [MovieLens terms](https://grouplens.org/datasets/movielens/).