# Content-Based Movie Recommender

A single-page web application that recommends movies using **content-based filtering**. You pick movies you like, the app builds a *user profile vector* (the average of their genre vectors) and scores every other movie with **cosine similarity** to suggest the titles most like your taste.

Built with vanilla HTML, CSS, and JavaScript — no frameworks, no build step.

## Features

- **Profile-based recommendations** — the profile is the average genre vector of all movies you've watched.
- **Cosine similarity** — candidates are ranked by `dot(A, B) / (||A|| · ||B||)` against your profile.
- **Up to 3 movies per selection** — each field is a **type-ahead search box**: just start typing a film name and pick it from the suggestions (an empty box means "None"), and you can keep adding movies at any time.
- **Automatic recalculation** — every time you add a movie, the profile is rebuilt and the Top-5 recommendations refresh automatically.
- **Top-5 list with pagination** — "Show Next Top-5" walks through the ranked list (1–5, 6–10, 11–15, …) until you watch/add something new, which resets the window.
- **History persistence** — with history enabled, your watched movies are saved in `localStorage` and reused on the next visit; disable it to ignore the saved history completely and use each request as a *one-off* (picks are used for that recommendation only and nothing is recorded), with the status shown via a chip.
- **No repeats** — already-watched movies never reappear in the recommendations.
- **Reset** — deletes all saved history and starts from scratch.
- **Single item vs aggregated profile experiment** — a built-in cartoon-fan demo user, rendered as a side-by-side Top-5 table comparing recommendations from the *last watched movie* alone against the *whole watch history*, with the Jaccard index, overlap count, and unique elements of each list.
- **Dataset analysis** — two animated explorations of the real data: (1) how cosine normalization changes similarity as movies have few vs many genres (reference: *Star Wars*, 1977), and (2) how many *long-tail* movies (few ratings, threshold selectable: bottom 25% / bottom 50%) each of the two Top-5 approaches recommends.

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

1. Type a film name into one of the three search boxes and pick it from the suggestions (leave a box empty to skip it). Click **Give a Recommendation**.
2. The Top-5 recommendations appear immediately, ranked by cosine similarity to your profile.
3. Click **Show Next Top-5** to paginate through the ranked list without changing your profile.
4. Keep adding movies to refine the profile — recommendations update automatically.
5. Toggle **history**: ON saves your watched list between sessions; OFF ignores saved history and treats each request as a one-off (nothing is recorded).
6. Click **Reset** to delete the history and start over.
7. In the **Experiment** section, Top-5 are compared two ways: against the *last watched movie* only (single active item) versus the *averaged profile* — with Jaccard index, overlap count, unique items per list, and charts. It can target **your profile** or the built-in **demo cartoon-fan user** — click **Compare current profile / Return to demo experiment** to switch between them.
8. The **Dataset analysis** section follows the same two lists: it shows how cosine normalization behaves for movies with few vs many genres, and long-tail distributions (switch the threshold between bottom 25% and 50% of rated movies).

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