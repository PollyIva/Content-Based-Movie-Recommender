// ============================================================================
// script.js — UI & recommendation logic module
// Depends on data.js (movies, ratings, loadData, GENRE_DIMENSIONS).
// Builds a user profile vector = average of the genre vectors of watched
// movies, then scores every unwatched movie with cosine similarity.
// ============================================================================

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const STORAGE_WATCHED = 'movierec.watched';
const STORAGE_HISTORY = 'movierec.historyOn';

const BATCH_SIZE = 5; // number of recommendations shown per page

// Movies the user has liked so far (the "profile")
let watchedMovies = [];

// Sorted, scored list of all movies not yet watched
let rankedMovies = [];

// Offset into rankedMovies used for "Show Next Top-5" pagination (0, 5, 10, ...)
let batchStart = 0;

// Whether watched movies are persisted to localStorage and reused next session
let historyEnabled = true;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const watchedIds = () => new Set(watchedMovies.map(movie => movie.id));
const movieById = id => movies.find(movie => movie.id === id);

function setStatus(message, error = false) {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = error ? 'status error' : 'status';
    }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------
window.onload = async function () {
    try {
        setStatus('Loading movie data...');
        await loadData();

        populateMovieSelects();
        restoreHistoryState();
        renderAll();

        setStatus('Data loaded. Select up to 3 movies and click "Add to Profile".');
    } catch (error) {
        console.error('Initialization error:', error);
        // Error message was already written to the page by data.js
    }
};

// ---------------------------------------------------------------------------
// UI: populate the three movie dropdowns (each starts with a "None" option)
// ---------------------------------------------------------------------------
function populateMovieSelects() {
    const sortedMovies = [...movies].sort((a, b) => a.title.localeCompare(b.title));

    for (let i = 1; i <= 3; i++) {
        const select = document.getElementById(`movie-select-${i}`);
        select.innerHTML = '';

        // "None" placeholder for optional fields
        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = 'None';
        select.appendChild(noneOption);

        for (const movie of sortedMovies) {
            const option = document.createElement('option');
            option.value = movie.id;
            option.textContent = movie.title;
            select.appendChild(option);
        }
    }
}

// ---------------------------------------------------------------------------
// Profile construction
// ---------------------------------------------------------------------------
function buildProfileVector() {
    const dimensions = GENRE_DIMENSIONS.length; // 19
    const profile = new Array(dimensions).fill(0);

    // Average the genre vectors of every watched movie
    for (const movie of watchedMovies) {
        for (let i = 0; i < dimensions; i++) {
            profile[i] += movie.vector[i];
        }
    }
    for (let i = 0; i < dimensions; i++) {
        profile[i] = profile[i] / watchedMovies.length;
    }
    return profile;
}

// ---------------------------------------------------------------------------
// Similarity metric (replaces the old Jaccard index)
// score = dot(A, B) / (||A|| * ||B||)
// ---------------------------------------------------------------------------
function cosineSimilarity(vectorA, vectorB) {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vectorA.length; i++) {
        dot += vectorA[i] * vectorB[i];
        normA += vectorA[i] * vectorA[i];
        normB += vectorB[i] * vectorB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ---------------------------------------------------------------------------
// Rank every unwatched movie against the profile with cosine similarity.
// Already-watched movies are always excluded from the results.
// ---------------------------------------------------------------------------
function recalculate() {
    const profile = buildProfileVector();
    const watched = watchedIds();

    rankedMovies = movies
        .filter(movie => !watched.has(movie.id))
        .map(movie => ({
            ...movie,
            score: cosineSimilarity(profile, movie.vector)
        }))
        .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderAll() {
    renderWatched();
    renderResults();
    updateChip();
}

function renderWatched() {
    const listElement = document.getElementById('watched-list');
    const metricsElement = document.getElementById('metrics');

    listElement.innerHTML = '';
    metricsElement.textContent = `Profile: ${watchedMovies.length} movie(s) · vector = average of their genre vectors`;

    if (watchedMovies.length === 0) {
        listElement.innerHTML = '<li class="empty">No movies in your profile yet.</li>';
        return;
    }

    for (const movie of watchedMovies) {
        const li = document.createElement('li');
        li.textContent = movie.title;
        listElement.appendChild(li);
    }
}

function renderResults() {
    const listElement = document.getElementById('result');
    listElement.innerHTML = '';

    // No profile yet -> nothing to compare against
    if (watchedMovies.length === 0) {
        listElement.innerHTML = '<li class="empty">Add movies to your profile to see recommendations.</li>';
        return;
    }

    // Profile exists but every movie has been watched
    if (rankedMovies.length === 0) {
        listElement.innerHTML = '<li class="empty">You have watched every movie. Reset to start over.</li>';
        return;
    }

    const chunk = rankedMovies.slice(batchStart, batchStart + BATCH_SIZE);

    // Pagination ran past the end of the ranked list
    if (chunk.length === 0) {
        listElement.innerHTML =
            '<li class="empty">No more recommendations. Add a new movie to refresh, or reset to start over.</li>';
        return;
    }

    chunk.forEach((movie, index) => {
        const li = document.createElement('li');

        const rank = document.createElement('span');
        rank.className = 'rank';
        rank.textContent = batchStart + index + 1;

        const title = document.createElement('span');
        title.className = 'title';
        title.textContent = movie.title;

        const score = document.createElement('span');
        score.className = 'score';
        score.textContent = `${(movie.score * 100).toFixed(0)}% match`;

        li.appendChild(rank);
        li.appendChild(title);
        li.appendChild(score);
        listElement.appendChild(li);
    });
}

function updateChip() {
    const chip = document.getElementById('history-chip');
    if (historyEnabled) {
        chip.textContent = `History ON · ${loadStoredIds().length} saved`;
        chip.className = 'chip chip-on';
    } else {
        chip.textContent = 'History OFF · nothing saved';
        chip.className = 'chip chip-off';
    }
}

// ---------------------------------------------------------------------------
// User actions
// ---------------------------------------------------------------------------
// Add the currently selected movies (up to 3) to the profile.
function addMovies() {
    const added = [];
    const duplicates = [];

    for (let i = 1; i <= 3; i++) {
        const select = document.getElementById(`movie-select-${i}`);
        const selectedId = parseInt(select.value);
        select.value = ''; // reset field to "None" so it can be reused

        if (isNaN(selectedId)) continue;

        const movie = movieById(selectedId);
        if (!movie) continue;

        if (watchedIds().has(selectedId)) {
            duplicates.push(movie.title);
        } else {
            watchedMovies.push(movie);
            added.push(movie.title);
        }
    }

    if (added.length > 0) {
        // Persist (only meaningful when history is enabled) and recalc from the top
        saveHistoryIfEnabled();
        batchStart = 0;
        recalculate();
        renderAll();
        setStatus(
            `Added "${added.join('", "')}" to your profile. Profile updated, recommendations recalculated automatically.`
        );
    } else {
        renderAll();
        const message = duplicates.length > 0
            ? `"${duplicates.join('", "')}" already in profile. Select something new.`
            : 'Select at least one movie from the dropdowns first.';
        setStatus(message);
    }
}

// Advance the recommendation window by 5, showing 6-10, 11-15, etc.
function showNextRecommendations() {
    if (watchedMovies.length === 0) {
        setStatus('Add movies to your profile before requesting recommendations.');
        return;
    }

    batchStart += BATCH_SIZE;
    renderResults();

    setStatus(
        `Showing recommendations ${batchStart + 1}–${Math.min(batchStart + BATCH_SIZE, rankedMovies.length)} of ${rankedMovies.length} ` +
        `(profile unchanged — no new movie added).`
    );
}

// Delete all history and start from scratch.
function resetProfile() {
    watchedMovies = [];
    rankedMovies = [];
    batchStart = 0;

    for (let i = 1; i <= 3; i++) {
        document.getElementById(`movie-select-${i}`).value = '';
    }

    localStorage.removeItem(STORAGE_WATCHED);
    renderAll();

    setStatus('History deleted. Your profile has been reset — start fresh!');
}

// The "None" option is already available via populateMovieSelects().
// This alias exists so the spec's browsing model is explicit.
function getRecommendations() {
    addMovies();
}

// ---------------------------------------------------------------------------
// History (persistence) logic
// ---------------------------------------------------------------------------
// Load saved ids and merge them into the current profile (used when history
// is switched back on or at startup).
function restoreHistoryState() {
    const storedToggle = localStorage.getItem(STORAGE_HISTORY);
    historyEnabled = storedToggle === null ? true : storedToggle === 'true';
    document.getElementById('history-toggle').checked = historyEnabled;

    if (historyEnabled) {
        for (const id of loadStoredIds()) {
            const movie = movieById(id);
            if (movie && !watchedIds().has(id)) watchedMovies.push(movie);
        }
        if (watchedMovies.length > 0) {
            batchStart = 0;
            recalculate();
        }
    }
    updateChip();
}

function loadStoredIds() {
    try {
        const raw = localStorage.getItem(STORAGE_WATCHED);
        return raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.warn('Could not parse saved history:', error);
        return [];
    }
}

function saveHistoryIfEnabled() {
    if (!historyEnabled) return;
    localStorage.setItem(STORAGE_WATCHED, JSON.stringify(watchedMovies.map(movie => movie.id)));
}

function onHistoryToggle() {
    historyEnabled = document.getElementById('history-toggle').checked;
    localStorage.setItem(STORAGE_HISTORY, String(historyEnabled));

    if (historyEnabled) {
        // Re-enable: pull previously saved movies back into the analysis
        let restored = 0;
        for (const id of loadStoredIds()) {
            const movie = movieById(id);
            if (movie && !watchedIds().has(id)) {
                watchedMovies.push(movie);
                restored++;
            }
        }
        if (restored > 0) {
            batchStart = 0;
            recalculate();
        }
        saveHistoryIfEnabled(); // persist union of in-session + stored
        renderAll();
        setStatus(`History enabled — ${restored} saved movie(s) restored and used for analysis.`);
    } else {
        // Disable: keep the in-session list, but stop saving and ignore stored data
        renderAll();
        setStatus('History disabled — new movies are not saved and saved history is not used.');
    }
    updateChip();
}

// ---------------------------------------------------------------------------
// Wire up event listeners (DOM is fully parsed because scripts load at the end)
// ---------------------------------------------------------------------------
document.getElementById('add-btn').addEventListener('click', addMovies);
document.getElementById('refresh-btn').addEventListener('click', showNextRecommendations);
document.getElementById('reset-btn').addEventListener('click', resetProfile);
document.getElementById('history-toggle').addEventListener('change', onHistoryToggle);