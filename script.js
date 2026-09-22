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
const MOVIE_FIELD_COUNT = 3; // three type-ahead fields
const MAX_SUGGESTIONS = 10; // max candidates shown while typing
const COMPARISON_SIZE = 5; // how many recommendations the experiment compares

// Which user the experiment compares: the built-in demo ('demo') or the
// live profile of whoever is using the page right now ('current')
let comparisonMode = 'demo';

// Demo user with a cartoon-heavy viewing history, used for the
// "single active item vs aggregated profile" comparison experiment.
// "Last watched" (the single active item) is the final id in the list.
const DEMO_USER = {
    name: 'Alex (cartoon fan)',
    movieIds: [1, 71, 95, 99, 404, 50, 174, 204, 588]
    // Toy Story (1), Lion King (71), Aladdin (95), Snow White (99),
    // Pinocchio (404), Star Wars (50), Raiders of the Lost Ark (174),
    // Back to the Future (204), Beauty and the Beast (588) — the last one
    // is the "single active item" of the experiment.
};

// Movies the user has liked so far (the "profile")
let watchedMovies = [];

// Sorted, scored list of all movies not yet watched
let rankedMovies = [];

// Offset into rankedMovies used for "Show Next Top-5" pagination (0, 5, 10, ...)
let batchStart = 0;

// Whether watched movies are persisted to localStorage and reused next session
let historyEnabled = true;

// Selected movie id per field ('' means "None") — resolved from typed text or clicks
const selectedMovieIds = ['', '', ''];

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

        initMovieInputs();
        restoreHistoryState();
        renderAll();
        runComparison();

        setStatus('Data loaded. Select up to 3 movies and click "Add to Profile".');
    } catch (error) {
        console.error('Initialization error:', error);
        // Error message was already written to the page by data.js
    }
};

// ---------------------------------------------------------------------------
// UI: type-ahead movie search (combobox)
// Each field is a text input whose dropdown lists movies matching the typed
// text as you type. Clicking a suggestion (or Enter with a highlighted one)
// stores the movie's id; an empty input means "None".
// ---------------------------------------------------------------------------
function initMovieInputs() {
    for (let i = 1; i <= MOVIE_FIELD_COUNT; i++) {
        const input = document.getElementById(`movie-input-${i}`);

        input.addEventListener('input', () => renderSuggestions(i));
        input.addEventListener('focus', () => renderSuggestions(i));
        input.addEventListener('keydown', event => handleSuggestionKeydown(event, i));
    }

    // Hide open suggestion lists when clicking anywhere outside the comboboxes
    document.addEventListener('click', event => {
        if (!event.target.closest('.combobox')) hideAllSuggestions();
    });
}

function renderSuggestions(fieldIndex) {
    const input = document.getElementById(`movie-input-${fieldIndex}`);
    const list = document.getElementById(`movie-list-${fieldIndex}`);
    const query = input.value.trim().toLowerCase();

    // Text changed, so any previously picked id no longer applies
    selectedMovieIds[fieldIndex - 1] = '';

    if (query === '') {
        hideList(fieldIndex);
        return;
    }

    const matches = [];
    for (const movie of movies) {
        if (movie.title.toLowerCase().includes(query)) {
            matches.push(movie);
            if (matches.length >= MAX_SUGGESTIONS) break;
        }
    }

    list.innerHTML = '';
    if (matches.length === 0) {
        const noMatch = document.createElement('li');
        noMatch.className = 'no-match';
        noMatch.textContent = 'No matching films';
        list.appendChild(noMatch);
    } else {
        matches.forEach((movie, index) => {
            const item = document.createElement('li');
            const title = document.createElement('span');
            title.textContent = movie.title;
            item.appendChild(title);

            const year = document.createElement('small');
            year.textContent = movie.genres.length ? ` · ${movie.genres.slice(0, 3).join(', ')}` : '';
            item.appendChild(year);

            item.dataset.id = movie.id;
            if (index === 0) item.classList.add('is-active');
            item.addEventListener('click', () => selectMovie(fieldIndex, movie));
            list.appendChild(item);
        });
    }
    list.hidden = false;
}

function selectMovie(fieldIndex, movie) {
    selectedMovieIds[fieldIndex - 1] = String(movie.id);
    const input = document.getElementById(`movie-input-${fieldIndex}`);
    input.value = movie.title;
    hideList(fieldIndex);
}

function handleSuggestionKeydown(event, fieldIndex) {
    const list = document.getElementById(`movie-list-${fieldIndex}`);

    if (list.hidden && (event.key === 'ArrowDown' || event.key === 'Enter')) {
        renderSuggestions(fieldIndex);
        return;
    }
    if (list.hidden) return;

    const items = [...list.querySelectorAll('li:not(.no-match)')];
    if (items.length === 0) {
        if (event.key === 'Enter') { event.preventDefault(); hideList(fieldIndex); }
        return;
    }

    const activeIndex = items.findIndex(item => item.classList.contains('is-active'));

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        highlightSuggestion(items, Math.min(activeIndex + 1, items.length - 1));
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        highlightSuggestion(items, Math.max(activeIndex - 1, 0));
    } else if (event.key === 'Enter') {
        event.preventDefault();
        if (activeIndex >= 0) {
            const movie = movieById(parseInt(items[activeIndex].dataset.id));
            if (movie) selectMovie(fieldIndex, movie);
        }
    } else if (event.key === 'Escape') {
        event.preventDefault();
        hideList(fieldIndex);
    }
}

function highlightSuggestion(items, index) {
    items.forEach(item => item.classList.remove('is-active'));
    items[index].classList.add('is-active');
    items[index].scrollIntoView({ block: 'nearest' });
}

function hideList(fieldIndex) {
    document.getElementById(`movie-list-${fieldIndex}`).hidden = true;
}

function hideAllSuggestions() {
    for (let i = 1; i <= MOVIE_FIELD_COUNT; i++) hideList(i);
}

// Resolve free-typed text to a movie: exact title match first, then substring.
function findMovieByText(text) {
    const query = text.trim().toLowerCase();
    if (query === '') return null;
    const exact = movies.find(movie => movie.title.toLowerCase() === query);
    if (exact) return exact;
    return movies.find(movie => movie.title.toLowerCase().includes(query)) || null;
}

function clearMovieField(fieldIndex) {
    document.getElementById(`movie-input-${fieldIndex}`).value = '';
    selectedMovieIds[fieldIndex - 1] = '';
    hideList(fieldIndex);
}

// ---------------------------------------------------------------------------
// Profile construction
// ---------------------------------------------------------------------------
function buildProfileVector(movieList = watchedMovies) {
    const dimensions = GENRE_DIMENSIONS.length; // 19
    const profile = new Array(dimensions).fill(0);

    if (movieList.length === 0) return profile;

    // Average the genre vectors of every movie in the list
    for (const movie of movieList) {
        for (let i = 0; i < dimensions; i++) {
            profile[i] += movie.vector[i];
        }
    }
    for (let i = 0; i < dimensions; i++) {
        profile[i] = profile[i] / movieList.length;
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
    const notFound = [];

    for (let i = 1; i <= MOVIE_FIELD_COUNT; i++) {
        const typedText = document.getElementById(`movie-input-${i}`).value;
        if (typedText.trim() === '') continue; // empty field = "None"

        // Prefer the movie picked from the suggestion list; otherwise resolve the typed text
        const movie = selectedMovieIds[i - 1]
            ? movieById(parseInt(selectedMovieIds[i - 1]))
            : findMovieByText(typedText);
        clearMovieField(i);

        if (!movie) {
            notFound.push(typedText.trim());
            continue;
        }

        if (watchedIds().has(movie.id)) {
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
        if (comparisonMode === 'current') runComparison();
        setStatus(
            `Added "${added.join('", "')}" to your profile. Profile updated, recommendations recalculated automatically.`
        );
    } else {
        renderAll();
        let message;
        if (duplicates.length > 0) {
            message = `"${duplicates.join('", "')}" already in profile. Select something new.`;
        } else if (notFound.length > 0) {
            message = `No film named "${notFound.join('", "')}" found. Pick one from the suggestions.`;
        } else {
            message = 'Type at least one film name and pick it from the suggestions.';
        }
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

    for (let i = 1; i <= MOVIE_FIELD_COUNT; i++) {
        clearMovieField(i);
    }

    localStorage.removeItem(STORAGE_WATCHED);
    renderAll();
    if (comparisonMode === 'current') runComparison();

    setStatus('History deleted. Your profile has been reset — start fresh!');
}

// An empty field means "None" (see the type-ahead inputs above).
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
    if (comparisonMode === 'current') runComparison();
    updateChip();
}

// ---------------------------------------------------------------------------
// Experiment: single active item vs aggregated profile
// ---------------------------------------------------------------------------
// Rank the top N movies against a query vector, excluding already-watched ids.
function topNRecommendations(queryVector, excludeIds, count = COMPARISON_SIZE) {
    return movies
        .filter(movie => !excludeIds.has(movie.id))
        .map(movie => ({
            ...movie,
            score: cosineSimilarity(queryVector, movie.vector)
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, count);
}

// The section can target either the built-in demo user or the live profile.
// The header button toggles between the two targets and re-runs the analysis.
function toggleComparisonTarget() {
    comparisonMode = comparisonMode === 'demo' ? 'current' : 'demo';
    runComparison();
}

// Keeps the chip and the button label in sync with the active target.
function updateComparisonControls() {
    const chip = document.getElementById('comparison-target-chip');
    const button = document.getElementById('compare-btn');

    if (comparisonMode === 'current') {
        chip.textContent = 'Target: your profile';
        chip.className = 'chip chip-current';
        button.textContent = 'Return to demo experiment';
    } else {
        chip.textContent = `Target: demo user (${DEMO_USER.name.split(' ')[0]})`;
        chip.className = 'chip chip-demo';
        button.textContent = 'Compare current profile';
    }
}

// Runs the comparison for whichever target is active.
function runComparison() {
    updateComparisonControls();
    if (comparisonMode === 'current') {
        runCurrentComparison();
    } else {
        runDemoComparison();
    }
}

// Original experiment: demo cartoon-fan user vs his own last item.
function runDemoComparison() {
    const demoMovies = DEMO_USER.movieIds.map(id => movieById(id)).filter(Boolean);
    const lastMovie = demoMovies[demoMovies.length - 1];
    const exclude = new Set(demoMovies.map(movie => movie.id));

    // A) Recommendations purely from the last watched item
    const singleItemTop = topNRecommendations(lastMovie.vector, exclude);

    // B) Recommendations from the aggregated profile (average of all watched)
    const profileTop = topNRecommendations(buildProfileVector(demoMovies), exclude);

    const description = `Demo user "${DEMO_USER.name}" watched ${demoMovies.length} cartoon-leaning movies: ` +
        `${demoMovies.map(movie => movie.title).join('; ')}. ` +
        `"Single active item" (last) = "${lastMovie.title}".`;
    renderComparison(singleItemTop, profileTop, description);
}

// Same comparison, but for the profile of the currently open user.
function runCurrentComparison() {
    if (watchedMovies.length === 0) {
        clearComparisonView('Your profile is empty. Add some movies first — the comparison will then use your history.');
        return;
    }

    const lastMovie = watchedMovies[watchedMovies.length - 1];
    const exclude = new Set(watchedMovies.map(movie => movie.id));

    const singleItemTop = topNRecommendations(lastMovie.vector, exclude);
    const profileTop = topNRecommendations(buildProfileVector(watchedMovies), exclude);

    const description = `Your profile: ${watchedMovies.length} movie(s): ` +
        `${watchedMovies.map(movie => movie.title).join('; ')}. ` +
        `"Single active item" (last added) = "${lastMovie.title}".`;
    renderComparison(singleItemTop, profileTop, description);
}

// Empty-profile state: show a hint instead of stale results.
function clearComparisonView(message) {
    document.getElementById('experiment-desc').textContent = message;
    document.querySelector('#comparison-table tbody').innerHTML = '';
    document.getElementById('rank-chart').innerHTML = '';
    document.getElementById('rank-legend').innerHTML = '';
    document.getElementById('set-bar').innerHTML = '';
    document.getElementById('set-legend').innerHTML = '';
    document.getElementById('set-chips').innerHTML = '';
    document.getElementById('comparison-metrics').innerHTML = '';
}

function renderComparison(singleTop, profileTop, description) {
    // 1) Describe the target user and what "single active item" means here
    document.getElementById('experiment-desc').textContent = description;

    // 2) Side-by-side Top-5 table
    const tbody = document.querySelector('#comparison-table tbody');
    tbody.innerHTML = '';
    for (let i = 0; i < COMPARISON_SIZE; i++) {
        const row = document.createElement('tr');

        const rankCell = document.createElement('td');
        rankCell.textContent = i + 1;

        const singleTitle = document.createElement('td');
        singleTitle.textContent = singleTop[i] ? singleTop[i].title : '—';
        const singleScore = document.createElement('td');
        singleScore.textContent = singleTop[i] ? `${(singleTop[i].score * 100).toFixed(0)}%` : '—';

        const profileTitle = document.createElement('td');
        profileTitle.textContent = profileTop[i] ? profileTop[i].title : '—';
        const profileScore = document.createElement('td');
        profileScore.textContent = profileTop[i] ? `${(profileTop[i].score * 100).toFixed(0)}%` : '—';

        row.append(rankCell, singleTitle, singleScore, profileTitle, profileScore);
        tbody.appendChild(row);
    }

    // 3) Metrics: Jaccard index, overlap count, unique elements of each list
    const singleIds = singleTop.map(movie => movie.id);
    const profileIds = profileTop.map(movie => movie.id);
    const singleSet = new Set(singleIds);
    const profileSet = new Set(profileIds);

    const overlap = singleIds.filter(id => profileSet.has(id));
    const union = new Set([...singleIds, ...profileIds]);
    const jaccard = union.size > 0 ? overlap.length / union.size : 0;

    const uniqueSingle = singleTop.filter(movie => !profileSet.has(movie.id));
    const uniqueProfile = profileTop.filter(movie => !singleSet.has(movie.id));

    const metricsEl = document.getElementById('comparison-metrics');
    metricsEl.innerHTML = '';
    const lines = [
        `Jaccard index (|A ∩ B| / |A ∪ B|) = ${overlap.length} / ${union.size} = ${jaccard.toFixed(3)}`,
        `Overlap count (|A ∩ B|) = ${overlap.length} movie(s)` +
            (overlap.length ? ` — ${overlap.map(id => movieById(id).title).join('; ')}` : ''),
        `Unique to single-item list (A \\ B): ${uniqueSingle.map(movie => movie.title).join('; ') || 'none'}`,
        `Unique to aggregated profile list (B \\ A): ${uniqueProfile.map(movie => movie.title).join('; ') || 'none'}`
    ];
    lines.forEach(text => {
        const p = document.createElement('p');
        p.textContent = text;
        metricsEl.appendChild(p);
    });

    // 4) Visualizations
    renderRankChart(singleTop, profileTop);
    renderSetVisualization(singleTop, profileTop);
}

// Vertical grouped bars: similarity % for the single-item vs the aggregated
// profile at each rank.
function renderRankChart(singleTop, profileTop) {
    const container = document.getElementById('rank-chart');
    container.innerHTML = '';

    for (let i = 0; i < COMPARISON_SIZE; i++) {
        const single = singleTop[i];
        const aggregate = profileTop[i];
        if (!single || !aggregate) continue;

        const group = document.createElement('div');
        group.className = 'rank-group';

        const bars = document.createElement('div');
        bars.className = 'bars';
        bars.appendChild(buildBarPair(single, 'bar-single'));
        bars.appendChild(buildBarPair(aggregate, 'bar-agg'));
        group.appendChild(bars);

        const rank = document.createElement('div');
        rank.className = 'rank-num';
        rank.textContent = `#${i + 1}`;
        group.appendChild(rank);

        const titleSingle = document.createElement('div');
        titleSingle.className = 't-name';
        titleSingle.textContent = single.title;
        titleSingle.title = single.title;
        group.appendChild(titleSingle);

        const titleAgg = document.createElement('div');
        titleAgg.className = 't-name';
        titleAgg.textContent = aggregate.title;
        titleAgg.title = aggregate.title;
        group.appendChild(titleAgg);

        container.appendChild(group);
    }

    const legend = document.getElementById('rank-legend');
    legend.innerHTML = '';
    legend.appendChild(makeLegendDot('dot-single', 'Single item (last watched)'));
    legend.appendChild(makeLegendDot('dot-agg', 'Aggregated profile'));
}

function buildBarPair(movie, barClass) {
    const side = document.createElement('div');
    side.className = 'side';
    side.title = `${movie.title} — ${(movie.score * 100).toFixed(0)}%`;

    const pct = document.createElement('span');
    pct.className = 'pct';
    pct.textContent = `${(movie.score * 100).toFixed(0)}%`;

    const bar = document.createElement('div');
    bar.className = `bar ${barClass}`;
    bar.style.height = `${Math.max(3, Math.round(movie.score * 100))}%`;

    side.append(pct, bar);
    return side;
}

function makeLegendDot(dotClass, label) {
    const item = document.createElement('span');
    const dot = document.createElement('span');
    dot.className = `dot ${dotClass}`;
    item.appendChild(dot);
    item.appendChild(document.createTextNode(label));
    return item;
}

// Stacked bar + colored chips showing how the two Top-5 lists overlap:
// blue = only in the single-item list, green = in both, orange = only in the
// aggregated profile list.
function renderSetVisualization(singleTop, profileTop) {
    const singleSet = new Set(singleTop.map(movie => movie.id));
    const profileSet = new Set(profileTop.map(movie => movie.id));

    const uniqueSingle = singleTop.filter(movie => !profileSet.has(movie.id));
    const overlap = singleTop.filter(movie => profileSet.has(movie.id));
    const uniqueAgg = profileTop.filter(movie => !singleSet.has(movie.id));

    const total = uniqueSingle.length + overlap.length + uniqueAgg.length;

    // Stacked bar
    const barEl = document.getElementById('set-bar');
    barEl.innerHTML = '';
    const segments = [
        { cls: 'seg-single', count: uniqueSingle.length, label: 'Single-item only', titles: uniqueSingle.map(m => m.title).join('; ') },
        { cls: 'seg-both', count: overlap.length, label: 'In both lists', titles: overlap.map(m => m.title).join('; ') },
        { cls: 'seg-agg', count: uniqueAgg.length, label: 'Aggregated only', titles: uniqueAgg.map(m => m.title).join('; ') }
    ];
    segments.forEach(seg => {
        if (seg.count === 0) return;
        const el = document.createElement('div');
        el.className = `seg ${seg.cls}`;
        el.style.width = `${(seg.count / total) * 100}%`;
        el.title = `${seg.label}: ${seg.count} movie(s) — ${seg.titles}`;

        const label = document.createElement('span');
        label.textContent = seg.count;
        if (seg.count / total < 0.18) label.classList.add('seg-out');
        el.appendChild(label);
        barEl.appendChild(el);
    });

    // Legend with counts
    const legend = document.getElementById('set-legend');
    legend.innerHTML = '';
    legend.appendChild(makeLegendDot('dot-uniq-single', `Single-item only (${uniqueSingle.length})`));
    legend.appendChild(makeLegendDot('dot-both', `In both lists (${overlap.length})`));
    legend.appendChild(makeLegendDot('dot-uniq-agg', `Aggregated only (${uniqueAgg.length})`));

    // Colored movie chips grouped by membership
    const chipsEl = document.getElementById('set-chips');
    chipsEl.innerHTML = '';
    const groups = [
        { movies: uniqueSingle, cls: 'chip-uniq-single' },
        { movies: overlap, cls: 'chip-both' },
        { movies: uniqueAgg, cls: 'chip-uniq-agg' }
    ];
    groups.forEach(group => {
        group.movies.forEach(movie => {
            const chip = document.createElement('span');
            chip.className = `schip ${group.cls}`;
            chip.textContent = movie.title;
            chip.title = movie.title;
            chipsEl.appendChild(chip);
        });
    });
}

// ---------------------------------------------------------------------------
// Wire up event listeners (DOM is fully parsed because scripts load at the end)
// ---------------------------------------------------------------------------
document.getElementById('add-btn').addEventListener('click', addMovies);
document.getElementById('refresh-btn').addEventListener('click', showNextRecommendations);
document.getElementById('reset-btn').addEventListener('click', resetProfile);
document.getElementById('history-toggle').addEventListener('change', onHistoryToggle);
document.getElementById('compare-btn').addEventListener('click', toggleComparisonTarget);