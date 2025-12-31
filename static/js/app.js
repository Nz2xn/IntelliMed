// static/js/app.js
import { fetchPapers, fetchTrendData } from './api.js';
import { getDetailedType, getAbstract, formatDate, generateCitation, sharePaper, analyzeStudyFeatures, highlightTerms } from './utils.js';
import { SETTINGS } from './config.js';

// --- 1. CONFIG: DROPDOWN OPTIONS ---
const SUBTOPICS = {
    surgical: [
        { val: "general", label: "General / Mixed" },
        { val: "gastrointestinal", label: "Gastrointestinal (GI)" },
        { val: "breast", label: "Breast Pathology" },
        { val: "gynecologic", label: "Gynecologic (Gyn)" },
        { val: "dermatopathology", label: "Dermatopathology" },
        { val: "genitourinary", label: "Genitourinary (GU)" },
        { val: "neuropathology", label: "Neuropathology" },
        { val: "soft_tissue", label: "Soft Tissue & Bone" },
        { val: "head_neck", label: "Head & Neck" }
    ],
    cytopathology: [
        { val: "general_cyto", label: "General Cytology" },
        { val: "fna", label: "Fine Needle Aspiration (FNA)" },
        { val: "gyn_cyto", label: "Pap Smear / Gyn" },
        { val: "fluids", label: "Serous Fluids / Effusions" }
    ],
    hematopathology: [
        { val: "lymphoma", label: "Lymphoma & Lymph Nodes" },
        { val: "leukemia", label: "Leukemia / Bone Marrow" },
        { val: "coagulation", label: "Coagulation / Transfusion" }
    ],
    molecular: [
        { val: "biomarkers", label: "Predictive Biomarkers" },
        { val: "ngs", label: "Next-Gen Sequencing (NGS)" },
        { val: "genetics", label: "Cytogenetics / FISH" }
    ],
    computational: [
        { val: "ai_diagnosis", label: "AI Diagnosis" },
        { val: "wsi", label: "Whole Slide Imaging" },
        { val: "prognosis_ai", label: "Prognostic Algorithms" }
    ]
};

// --- 2. STATE ---
let allPapers = [];
let savedPapers = JSON.parse(localStorage.getItem('savedPapers') || '[]');
let currentPage = 1;
let isViewingSaved = false;
let myChart = null; // Timeline Chart Instance
let journalChart = null; // Expert Chart Instance
let reviewMode = false;
let freePdfMode = false;

// DOM Elements
const resultsArea = document.getElementById('results-area');
const pagination = document.getElementById('pagination-controls');
const debugConsole = document.getElementById('debug-console');

// --- LOGGING ---
function log(msg) {
    if(debugConsole) {
        debugConsole.style.display = 'block';
        debugConsole.innerHTML += `<div>[${new Date().toLocaleTimeString()}] ${msg}</div>`;
        debugConsole.scrollTop = debugConsole.scrollHeight;
    }
}

// --- 3. DROPDOWN LOGIC (Fixing your issue) ---
window.updateSubTopics = function() {
    const categorySelect = document.getElementById('category-select');
    const subSelect = document.getElementById('subtopic-select');
    
    if (!categorySelect || !subSelect) return;

    const category = categorySelect.value;
    
    // Clear existing options
    subSelect.innerHTML = "";
    
    // Add new options based on the map above
    if (SUBTOPICS[category]) {
        SUBTOPICS[category].forEach(topic => {
            const option = document.createElement("option");
            option.value = topic.val;
            option.innerText = topic.label;
            subSelect.appendChild(option);
        });
    }
};

// --- 4. SIDEBAR & TOOLS ---
window.toggleReviewFilter = function() {
    reviewMode = !reviewMode;
    const btn = document.querySelector('.tool-btn[title="Show Reviews Only"]');
    if(btn) btn.classList.toggle('active');

    if (reviewMode) {
        const filtered = allPapers.filter(p => {
            const type = getDetailedType(p);
            return type === "REVIEW ARTICLE" || type === "SYSTEMATIC REVIEW";
        });
        if(filtered.length === 0) alert("No Review Articles found in this search.");
        else renderFilteredList(filtered, "Review Articles");
    } else {
        renderPage(1);
    }
};

window.toggleFreePdfFilter = function() {
    freePdfMode = !freePdfMode;
    const btn = document.querySelector('.tool-btn[title="Free PDFs Only"]');
    if(btn) btn.classList.toggle('active');

    if (freePdfMode) {
        const filtered = allPapers.filter(p => p.open_access?.is_oa === true);
        if(filtered.length === 0) alert("No Free PDFs found.");
        else renderFilteredList(filtered, "Free PDFs");
    } else {
        renderPage(1);
    }
};

window.toggleSortOrder = function() {
    const btn = document.querySelector('.tool-btn[title="Sort by Impact (Citations)"]');
    if (btn && btn.classList.contains('active')) {
        // Switch back to date
        btn.classList.remove('active');
        allPapers.sort((a, b) => new Date(b.publication_date) - new Date(a.publication_date));
        alert("Sorted by Date (Newest First)");
    } else {
        // Switch to Impact
        if(btn) btn.classList.add('active');
        allPapers.sort((a, b) => (b.cited_by_count || 0) - (a.cited_by_count || 0));
        alert("Sorted by Impact (Most Cited First)");
    }
    renderPage(1);
};

window.copyReadingList = function() {
    if (allPapers.length === 0) return;
    let textToCopy = "📚 Pathology Reading List:\n\n";
    const list = allPapers.slice(0, 50);
    list.forEach(p => {
        const title = p.title || "Untitled";
        const link = p.doi || p.primary_location?.landing_page_url || "#";
        const journal = p.primary_location?.source?.display_name || "Journal";
        const year = p.publication_year;
        textToCopy += `• ${title}\n  ${journal} (${year}) - ${link}\n\n`;
    });
    navigator.clipboard.writeText(textToCopy).then(() => alert("✅ Copied top 50 papers to clipboard!"));
};

window.toggleFocusMode = function() {
    const chartSection = document.getElementById('chart-section');
    const header = document.querySelector('.header');
    const controls = document.querySelector('.controls');
    const btn = document.querySelector('.tool-btn[title="Focus Mode (Hide Charts)"]');
    
    if(btn) btn.classList.toggle('active');

    if (chartSection.style.display === "none") {
        chartSection.style.display = "block";
        header.style.display = "block";
        controls.style.display = "flex";
    } else {
        chartSection.style.display = "none";
        header.style.display = "none";
        controls.style.display = "none";
    }
};

// --- 5. CHART LOGIC ---
// --- TOGGLE CHARTS (Open/Close Logic) ---
window.toggleChart = function(cardId, btnId) {
    // 1. Safety Check: If no search has run, stop.
    if (allPapers.length === 0) {
        alert("Please click 'Find Papers' first to generate the data.");
        return;
    }

    const card = document.getElementById(cardId);
    const btn = document.getElementById(btnId);
    
    // 2. Toggle Logic
    if (card.style.display === 'none') {
        // STATE: Closed -> OPEN IT
        card.style.display = 'block';
        if (btn) btn.classList.add('active-chart-btn'); // Turn button blue
        
        // Scroll smoothly to it so the user sees it immediately
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Flash effect for visibility
        card.style.transition = "box-shadow 0.3s";
        card.style.boxShadow = "0 0 0 4px rgba(37, 99, 235, 0.4)"; 
        setTimeout(() => { card.style.boxShadow = "none"; }, 800);

    } else {
        // STATE: Open -> CLOSE IT
        card.style.display = 'none';
        if (btn) btn.classList.remove('active-chart-btn'); // Turn button gray
    }
};

function renderTrendChart(trendData) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    // Data Prep
    const yearCounts = {};
    const currentYear = new Date().getFullYear(); 
    const startYear = currentYear - 9; 
    
    for (let y = startYear; y <= currentYear; y++) yearCounts[y] = 0;

    trendData.forEach(item => {
        const year = parseInt(item.key);
        if (year >= startYear && year <= currentYear) yearCounts[year] = item.count;
    });

    const labels = Object.keys(yearCounts);
    const dataPoints = Object.values(yearCounts);

    // Calc Trend
    const first3Avg = (dataPoints[0] + dataPoints[1] + dataPoints[2]) / 3 || 1;
    const last3Avg = (dataPoints[dataPoints.length-1] + dataPoints[dataPoints.length-2] + dataPoints[dataPoints.length-3]) / 3;
    const growthRate = ((last3Avg - first3Avg) / first3Avg) * 100;
    
    let trendLabel = "Stable Interest";
    let trendColor = "#64748b"; 
    let trendIcon = "fa-minus";

    if (growthRate > 50) { trendLabel = "🔥 Explosive Growth"; trendColor = "#ef4444"; trendIcon = "fa-arrow-trend-up"; } 
    else if (growthRate > 10) { trendLabel = "📈 Steadily Rising"; trendColor = "#10b981"; trendIcon = "fa-arrow-trend-up"; } 
    else if (growthRate < -10) { trendLabel = "📉 Declining Interest"; trendColor = "#94a3b8"; trendIcon = "fa-arrow-trend-down"; }

    const badge = document.getElementById('trend-badge');
    if(badge) badge.innerHTML = `<span style="background:${trendColor}15; color:${trendColor}; padding:4px 8px; border-radius:4px; font-weight:600;"><i class="fa-solid ${trendIcon}"></i> ${trendLabel}</span>`;

    // Draw
    if (myChart) myChart.destroy();
    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, `${trendColor}50`); 
    gradient.addColorStop(1, `${trendColor}00`);

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Publications',
                data: dataPoints,
                borderColor: trendColor,
                backgroundColor: gradient,
                borderWidth: 3,
                tension: 0.4,
                pointBackgroundColor: '#fff',
                pointBorderColor: trendColor,
                pointRadius: 4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, grid: { borderDash: [5, 5] } }, x: { grid: { display: false } } }
        }
    });
}

function renderExpertChart(papers) {
    const ctx = document.getElementById('journalChart');
    if (!ctx) return;

    const counts = {};
    const fullNames = {}; 

    papers.forEach(p => {
        if (p.authorships) {
            p.authorships.forEach(auth => {
                const name = auth.author.display_name;
                if (name && name !== "Unknown") {
                    counts[name] = (counts[name] || 0) + 1;
                }
            });
        }
    });

    const sortedAuthors = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const labels = [];
    const rawNames = [];

    sortedAuthors.forEach(item => {
        const fullName = item[0];
        const parts = fullName.split(" ");
        const shortName = parts.length > 1 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : fullName;
        labels.push(shortName);
        rawNames.push(fullName); 
    });
    
    if (journalChart) journalChart.destroy();

    journalChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Papers',
                data: sortedAuthors.map(x => x[1]),
                backgroundColor: ['#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'],
                borderRadius: 4,
                barThickness: 24
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            onClick: (e, elements) => {
                if (elements.length > 0) {
                    const index = elements[0].index;
                    window.filterResultsByAuthor(rawNames[index]);
                }
            },
            onHover: (event, chartElement) => {
                event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
            },
            scales: { x: { display: false }, y: { grid: { display: false } } }
        }
    });
}

window.filterResultsByAuthor = function(authorName) {
    const filtered = allPapers.filter(p => p.authorships.some(a => a.author.display_name === authorName));
    renderFilteredList(filtered, `Author: ${authorName}`);
};

// --- 6. MAIN SEARCH ---
window.startSearch = async function() {
    isViewingSaved = false;
    reviewMode = false; 
    freePdfMode = false;
    
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));

    const trendCard = document.getElementById('trend-card');
    const expertCard = document.getElementById('expert-card');
    const btnTrend = document.getElementById('btn-trend');
    const btnExpert = document.getElementById('btn-expert');

    if (trendCard) trendCard.style.display = 'none';
    if (expertCard) expertCard.style.display = 'none';
    if (btnTrend) btnTrend.classList.remove('active-chart-btn');
    if (btnExpert) btnExpert.classList.remove('active-chart-btn');

    const subSelect = document.getElementById('subtopic-select');
    const subtopicText = subSelect.options[subSelect.selectedIndex]?.text || "General";
    
    resultsArea.innerHTML = '<div style="text-align:center; padding:20px; color:#2563eb;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i><p style="margin-top:10px">Searching Verified Journals...</p></div>';
    pagination.style.display = 'none';
    
    log(`Starting Search: ${subtopicText}`);

    try {
        const papersPromise = fetchPapers();
        const trendsPromise = fetchTrendData();

        const [papers, trends] = await Promise.all([papersPromise, trendsPromise]);
        
        allPapers = papers;
        log(`SUCCESS! Found ${allPapers.length} papers.`);
        
        if (allPapers.length === 0) {
            resultsArea.innerHTML = '<div style="text-align:center;">No recent papers found...</div>';
            return;
        }

        renderTrendChart(trends);        
        renderExpertChart(allPapers);    

        currentPage = 1;
        renderPage(currentPage);
        pagination.style.display = 'flex';

    } catch (error) {
        console.error(error);
        log(`ERROR: ${error.message}`);
        resultsArea.innerHTML = `<div style="color:red; text-align:center;">Error: ${error.message}</div>`;
    }
};

window.viewSaved = function() {
    isViewingSaved = true;
    allPapers = [];
    resultsArea.innerHTML = '';
    
    const trendCard = document.getElementById('trend-card');
    const expertCard = document.getElementById('expert-card');
    if (trendCard) trendCard.style.display = 'none';
    if (expertCard) expertCard.style.display = 'none';

    if (savedPapers.length === 0) {
        resultsArea.innerHTML = '<div style="text-align:center; padding:20px;">Library is empty.</div>';
        pagination.style.display = 'none';
        return;
    }
    currentPage = 1;
    renderPage(1);
    pagination.style.display = 'flex';
};

// --- 7. RENDER LIST ---
function renderFilteredList(subset, label) {
    resultsArea.innerHTML = `
        <div style="padding:15px; background:#f0f9ff; color:#0369a1; border-radius:8px; margin-bottom:20px; font-weight:600; border:1px solid #bae6fd;">
            <i class="fa-solid fa-filter"></i> Filter Active: ${label} (${subset.length} results)
            <button onclick="renderPage(1)" style="float:right; background:white; border:1px solid #bae6fd; color:#0369a1; padding:2px 8px; border-radius:4px; cursor:pointer;">Clear</button>
        </div>
    `;
    subset.forEach((paper, index) => createCard(paper, index, false));
    pagination.style.display = 'none';
}

function renderPage(page) {
    resultsArea.innerHTML = '';
    const sourceArray = isViewingSaved ? savedPapers : allPapers;
    const start = (page - 1) * SETTINGS.resultsPerPage;
    const end = start + SETTINGS.resultsPerPage;
    const papersToShow = sourceArray.slice(start, end);
    
    const totalPages = Math.ceil(sourceArray.length / SETTINGS.resultsPerPage);
    document.getElementById('page-info').innerText = `Page ${page} of ${totalPages || 1}`;
    document.getElementById('prev-btn').disabled = (page === 1);
    document.getElementById('next-btn').disabled = (page === totalPages || totalPages === 0);

    if (papersToShow.length > 0) pagination.style.display = 'flex';

    papersToShow.forEach((paper, index) => {
        const trueIndex = start + index;
        const isSaved = savedPapers.some(p => p.id === paper.id);
        createCard(paper, trueIndex, isSaved);
    });
}

function createCard(paper, index, isSaved) {
    const title = paper.title || "Untitled";
    const link = paper.doi || paper.primary_location?.landing_page_url || "#";
    const type = getDetailedType(paper);
    const date = formatDate(paper.publication_date);
    const journal = paper.primary_location?.source?.display_name || "Journal";
    const firstAuthorObj = paper.authorships?.[0];
    const authorName = firstAuthorObj?.author?.display_name || "Unknown Author";
    const institution = firstAuthorObj?.institutions?.[0]?.display_name || "";
    const isMultiAuthor = (paper.authorships?.length || 0) > 1;

    let fullAbstract = getAbstract(paper.abstract_inverted_index);
    const searchContext = document.getElementById('subtopic-select');
    const searchTerm = searchContext ? (searchContext.options[searchContext.selectedIndex]?.text || "") : "";
    if (searchTerm && !searchTerm.includes("General")) fullAbstract = highlightTerms(fullAbstract, searchTerm);

    const studyFeatures = analyzeStudyFeatures(getAbstract(paper.abstract_inverted_index));
    const featureHTML = studyFeatures.map(f => `<span class="dna-tag" style="border-color:${f.color}; color:${f.color};"><i class="fa-solid ${f.icon}"></i> ${f.label}</span>`).join("");

    const citations = paper.cited_by_count || 0;
    const isOA = paper.open_access?.is_oa || false;
    const pdfUrl = paper.open_access?.oa_url || link; 
    
    let typeColor = "#0369a1", typeBg = "#e0f2fe";
    if (type === "CASE REPORT") { typeColor = "#9333ea"; typeBg = "#f3e8ff"; }
    if (type === "REVIEW ARTICLE") { typeColor = "#b45309"; typeBg = "#fef3c7"; }
    
    const card = document.createElement('div');
    card.className = 'paper-card';
    card.innerHTML = `
        <div class="card-top-row">
            <div class="tags">
                <span class="tag-type" style="background:${typeBg}; color:${typeColor}; padding:3px 10px; border-radius:15px; font-weight:700; font-size:0.7rem;">${type}</span>
                <span class="tag-level" style="background:#f0fdf4; color:#15803d; padding:3px 10px; border-radius:15px; font-weight:600; font-size:0.7rem;">${date}</span>
                <span class="tag-citation" style="background:${citations > 0 ? '#f8fafc' : '#fff'}; color:${citations > 0 ? '#64748b' : '#cbd5e1'}; border:1px solid ${citations > 0 ? '#e2e8f0' : '#f1f5f9'};">
                    <i class="fa-solid fa-quote-right"></i> ${citations > 0 ? `Cited by ${citations}` : 'New Article'}
                </span>
            </div>
            <div class="action-buttons">
                <button onclick="window.copyCitation(${index})"><i class="fa-regular fa-copy"></i></button>
                <button onclick="window.sharePaper(${index})"><i class="fa-solid fa-share-nodes"></i></button>
                <button onclick="window.toggleSave(${index})"><i class="${isSaved ? 'fa-solid' : 'fa-regular'} fa-star"></i></button>
            </div>
        </div>
        <h3 class="paper-title"><a href="${link}" target="_blank">${title}</a></h3>
        <div class="author-row">
            <i class="fa-solid fa-user-doctor author-icon"></i> <span class="author-name">${authorName}</span>
            ${institution ? `<span class="author-inst">from <strong>${institution}</strong></span>` : ''}
            ${isMultiAuthor ? `<span class="author-etal">et al.</span>` : ''}
        </div>
        ${featureHTML ? `<div class="study-dna-bar">${featureHTML}</div>` : ''}
        <div class="journal-badge">
             <span style="color:#334155; background:#f1f5f9; padding:6px 12px; border-radius:6px; font-size:0.9rem; font-weight:600;"><i class="fa-solid fa-book-medical" style="color:#2563eb;"></i> ${journal}</span>
        </div>
        <div class="paper-abstract"><strong>Abstract:</strong> ${fullAbstract}</div>
        <div style="margin-top:15px; display:flex; justify-content:flex-end; gap: 10px; align-items:center; min-height: 20px;">
            ${isOA ? `<a href="${pdfUrl}" target="_blank" class="pdf-btn"><i class="fa-solid fa-unlock"></i> Free PDF</a>` : ''}
        </div>
    `;
    resultsArea.appendChild(card);
}

// --- 8. INITIALIZATION & EXPORTS ---
document.addEventListener('DOMContentLoaded', () => {
    // Populate the dropdown immediately on load
    window.updateSubTopics();
});

// Helpers (Already defined in utils but needed globally for HTML clicks)
window.toggleSave = function(index) {
    const sourceArray = isViewingSaved ? savedPapers : allPapers;
    const paper = sourceArray[index];
    const existingIndex = savedPapers.findIndex(p => p.id === paper.id);
    if (existingIndex >= 0) savedPapers.splice(existingIndex, 1);
    else savedPapers.push(paper);
    localStorage.setItem('savedPapers', JSON.stringify(savedPapers));
    renderPage(currentPage);
};

window.copyCitation = function(index) {
    const sourceArray = isViewingSaved ? savedPapers : allPapers;
    const citation = generateCitation(sourceArray[index]);
    navigator.clipboard.writeText(citation).then(() => alert("Copied:\n" + citation));
};

window.sharePaper = function(index) {
    const sourceArray = isViewingSaved ? savedPapers : allPapers;
    sharePaper(sourceArray[index]);
};

window.changePage = function(dir) {
    currentPage += dir;
    renderPage(currentPage);
};

window.scrollToChart = function(chartId) {
    const card = document.getElementById(chartId).parentElement.parentElement;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
};