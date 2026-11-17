// ════════════════════════════════════════════════════════
// XSS KORUMA YARDIMCISI
// ════════════════════════════════════════════════════════
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// ════════════════════════════════════════════════════════
// UYGULAMA DURUMU (STATE - LOCALSTORAGE YOK, FIRESTORE TABANLI)
// ════════════════════════════════════════════════════════
let currentUser = null;
let isAdmin = false;
let questions = [...DEFAULT_QUESTIONS];
let cartoons = [...DEFAULT_CARTOONS];
let newsItems = [];
let contentBlocks = [...DEFAULT_BLOCKS];
let allUsersData = [];

let quizResults = {};
let totalScore = 0;

let currentQ = 0, score = 0, answered = [], activeQuestions = [];
let quizScoreAdded = false;
let compressedCartoonData = null;

// ════════════════════════════════════════════════════════
// FIREBASE AUTH & OTURUM YÖNETİMİ
// ════════════════════════════════════════════════════════
function showSplashAlert(msg) {
  const el = document.getElementById('splash-alert');
  if (el) {
    el.textContent = msg;
    setTimeout(() => el.textContent = '', 4500);
  }
}

function loginWithGoogle() {
  auth.signInWithPopup(googleProvider)
    .catch((error) => {
      console.error("Giriş hatası:", error);
      showSplashAlert('❌ Google ile giriş yapılamadı: ' + error.message);
    });
}

function logout() {
  auth.signOut().then(() => {
    currentUser = null;
    isAdmin = false;
    quizResults = {};
    totalScore = 0;
    document.getElementById('splash').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.body.classList.remove('admin-logged');
  });
}

// Oturum durumunu dinle
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = {
      uid: user.uid,
      fullname: user.displayName || user.email.split('@')[0],
      email: user.email
    };

    // Önceden belirlenen yönetici maili mi kontrol et
    isAdmin = (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());

    await loadUserDataFromFirestore();
    await loadSharedDataFromFirestore();

    startApp();
  } else {
    document.getElementById('splash').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  }
});

// ════════════════════════════════════════════════════════
// FIRESTORE VERİ YÜKLEME & KAYDETME
// ════════════════════════════════════════════════════════
async function loadUserDataFromFirestore() {
  if (!currentUser) return;
  try {
    const userRef = db.collection('users').doc(currentUser.uid);
    const doc = await userRef.get();
    if (doc.exists) {
      const data = doc.data();
      totalScore = data.totalScore || 0;
      quizResults = data.quizResults || {};
    } else {
      totalScore = 0;
      quizResults = {};
      await userRef.set({
        uid: currentUser.uid,
        fullname: currentUser.fullname,
        email: currentUser.email,
        totalScore: 0,
        quizResults: {},
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  } catch (e) {
    console.error("Kullanıcı verisi yüklenemedi:", e);
  }
}

async function saveUserProgressToFirestore() {
  if (!currentUser) return;
  try {
    await db.collection('users').doc(currentUser.uid).set({
      uid: currentUser.uid,
      fullname: currentUser.fullname,
      email: currentUser.email,
      totalScore: totalScore,
      quizResults: quizResults,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.error("İlerleme kaydedilemedi:", e);
  }
}

async function loadSharedDataFromFirestore() {
  try {
    // 1. Soruları Yükle (Varsayılan sorular + Firestore'dan gelen sorular)
    const qSnap = await db.collection('questions').get();
    const dbQuestions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    questions = [...DEFAULT_QUESTIONS, ...dbQuestions];

    // 2. Karikatürleri Yükle
    const cSnap = await db.collection('cartoons').get();
    const dbCartoons = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    cartoons = [...DEFAULT_CARTOONS, ...dbCartoons];

    // 3. Haberleri Yükle
    const nSnap = await db.collection('news').orderBy('createdAt', 'desc').get();
    newsItems = nSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // 4. İçerik Bloklarını Yükle
    const bSnap = await db.collection('blocks').get();
    const dbBlocks = bSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    contentBlocks = [...DEFAULT_BLOCKS, ...dbBlocks];
  } catch (e) {
    console.error("Ortak veriler çekilirken hata:", e);
  }
}

function startApp() {
  document.getElementById('splash').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('header-name').textContent = currentUser.fullname;
  document.getElementById('header-score').textContent = totalScore;

  const adminBtn = document.getElementById('admin-nav-btn');
  if (isAdmin) {
    adminBtn.style.display = '';
    document.body.classList.add('admin-logged');
  } else {
    adminBtn.style.display = 'none';
    document.body.classList.remove('admin-logged');
  }

  const nd = document.getElementById('news-date');
  if (nd) nd.value = new Date().toISOString().split('T')[0];

  renderAll();
  buildTopicCheckboxes();
  buildAdminTopicSelects();
  showPage('home', document.querySelector('.nav-btn'));
}

// ════════════════════════════════════════════════════════
// RENDER & NAVİGASYON
// ════════════════════════════════════════════════════════
function renderAll() {
  renderTopics();
  renderTdk();
  renderCartoons('all');
  renderNews();
  updateHomeStats();
}

function updateHomeStats() {
  document.getElementById('hs-soru').textContent = questions.length;
  document.getElementById('hs-karik').textContent = cartoons.length;
  document.getElementById('hs-puan').textContent = totalScore;
  document.getElementById('header-score').textContent = totalScore;
}

function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  if (id === 'analysis') renderAnalysis();
  if (id === 'quiz') buildTopicCheckboxes();
  if (id === 'admin' && isAdmin) {
    buildAdminTopicSelects();
    showAdmPanel('q-add', document.querySelector('.asb-btn'));
  }
  window.scrollTo(0, 0);
}

// ════════════════════════════════════════════════════════
// KONU ANLATIMI & TDK BLOKLARI
// ════════════════════════════════════════════════════════
function renderTopics() {
  const sections = ['topics-yazim', 'topics-noktalama'];
  const subMap = {
    'topics-yazim': ['buyuk-harf', 'sayilar', 'de-ki-mi', 'birlesik', 'kisaltma', 'karisik'],
    'topics-noktalama': ['nokta', 'virgul', 'noktali-virgul', 'iki-nokta', 'uc-nokta', 'soru', 'unlem']
  };
  const tabMap = { 'topics-yazim': 'yazim', 'topics-noktalama': 'noktalama' };

  sections.forEach(sec => {
    const tab = tabMap[sec];
    const sidebar = document.getElementById('sidebar-' + tab);
    const contentArea = document.getElementById('content-' + tab);
    if (!sidebar || !contentArea) return;
    const subs = subMap[sec];
    sidebar.innerHTML = '';
    contentArea.innerHTML = '';
    subs.forEach((sub, idx) => {
      const name = TOPIC_NAMES[sub] || sub;
      const btn = document.createElement('button');
      btn.className = 'topic-link' + (idx === 0 ? ' active' : '');
      btn.textContent = name;
      btn.onclick = () => showSubTopic(tab, sub);
      sidebar.appendChild(btn);

      const div = document.createElement('div');
      div.id = 'tsec-' + tab + '-' + sub;
      div.style.display = idx === 0 ? 'block' : 'none';
      const blocks = contentBlocks.filter(b => b.section === sec && b.sub === sub);
      blocks.forEach(bl => { div.appendChild(buildBlockEl(bl, true)); });
      contentArea.appendChild(div);
    });
  });
}

function renderTdk() {
  ['tdk-yazim', 'tdk-noktalama'].forEach(sec => {
    const wrap = document.getElementById(sec + '-blocks');
    if (!wrap) return;
    wrap.innerHTML = '';
    const blocks = contentBlocks.filter(b => b.section === sec);
    blocks.forEach(bl => wrap.appendChild(buildBlockEl(bl, false)));
  });
}

function buildBlockEl(bl, withAdminBar) {
  const div = document.createElement('div');
  div.className = 'content-block';
  div.dataset.blockId = bl.id;

  if (withAdminBar && !bl.isDefault) {
    const bar = document.createElement('div');
    bar.className = 'cb-admin-bar';
    bar.innerHTML = `<button class="cb-btn del" onclick="deleteBlock('${esc(bl.id)}')">🗑️ Sil</button>`;
    div.appendChild(bar);
  }

  const h3 = document.createElement('h3');
  h3.textContent = bl.title;
  div.appendChild(h3);

  if (bl.isTable) {
    const p = document.createElement('p');
    p.style.cssText = 'font-size:0.83rem;color:var(--muted);margin-bottom:12px;font-family:"Lora",serif';
    p.textContent = "TDK'ya göre doğru ve yanlış yazımlar:";
    div.appendChild(p);
    const tbl = document.createElement('table');
    tbl.className = 'compare-table';
    tbl.innerHTML = '<thead><tr><th>Yanlış ❌</th><th>Doğru ✅</th><th>Açıklama</th></tr></thead>';
    const tbody = document.createElement('tbody');
    KARISIK_TABLE.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="wrong">${esc(r[0])}</td><td class="right">${esc(r[1])}</td><td>${esc(r[2])}</td>`;
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    div.appendChild(tbl);
  } else {
    const lines = (bl.content || '').split('\n').filter(l => l.trim());
    if (lines.length > 1) {
      const ul = document.createElement('ul');
      ul.className = 'rule-list';
      lines.forEach(l => {
        const li = document.createElement('li');
        li.textContent = l;
        ul.appendChild(li);
      });
      div.appendChild(ul);
    } else if (lines.length === 1) {
      const p = document.createElement('p');
      p.style.cssText = 'font-family:"Lora",serif;line-height:1.7;font-size:0.95rem';
      p.textContent = lines[0];
      div.appendChild(p);
    }
  }

  if (bl.exGood || bl.exBad) {
    const ex = document.createElement('div');
    ex.className = 'example-box';
    if (bl.exGood) { const s = document.createElement('span'); s.className = 'ex-good'; s.textContent = '✅ ' + bl.exGood; ex.appendChild(s); ex.appendChild(document.createElement('br')); }
    if (bl.exBad) { const s = document.createElement('span'); s.className = 'ex-bad'; s.textContent = '❌ ' + bl.exBad; ex.appendChild(s); }
    div.appendChild(ex);
  }
  if (bl.note) { const nb = document.createElement('div'); nb.className = 'note-box'; nb.textContent = bl.note; div.appendChild(nb); }
  if (bl.emoji && bl.bubble) {
    const mc = document.createElement('div');
    mc.className = 'mini-cartoon';
    mc.innerHTML = `<div class="mc-emoji">${esc(bl.emoji)}</div><div class="mc-bubble">${esc(bl.bubble)}</div>`;
    div.appendChild(mc);
  }
  return div;
}

function showSubTopic(tab, sub) {
  const area = document.getElementById('topic-tab-' + tab);
  if (!area) return;
  area.querySelectorAll('[id^="tsec-' + tab + '-"]').forEach(d => d.style.display = 'none');
  area.querySelectorAll('.topic-link').forEach(b => b.classList.remove('active'));
  const sec = document.getElementById('tsec-' + tab + '-' + sub);
  if (sec) sec.style.display = 'block';
  const name = TOPIC_NAMES[sub] || sub;
  area.querySelectorAll('.topic-link').forEach(b => {
    if (b.textContent.trim() === name) b.classList.add('active');
  });
}

function setTopicTab(tab, btn) {
  document.querySelectorAll('.topic-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.topic-main-area').forEach(a => a.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const el = document.getElementById('topic-tab-' + tab);
  if (el) el.classList.add('active');
}

function setTdkTab(id, btn) {
  document.querySelectorAll('.tdk-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tdk-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tdk-' + id).classList.add('active');
  btn.classList.add('active');
}

function goTopicTab(tab, sub) {
  showPage('topics', document.querySelectorAll('.nav-btn')[1]);
  setTimeout(() => {
    setTopicTab(tab, null);
    setTimeout(() => showSubTopic(tab, sub), 60);
  }, 60);
}

// ════════════════════════════════════════════════════════
// KARİKATÜRLER & OTOMATİK GÖRSEL SIKIŞTIRMA (CANVAS)
// ════════════════════════════════════════════════════════
function previewAndCompressImage(inp) {
  const file = inp.files[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    alert('Lütfen 10MB\'dan küçük bir görsel seçin.');
    inp.value = '';
    return;
  }

  const infoEl = document.getElementById('ac-compress-info');
  infoEl.textContent = '⏳ Görsel sıkıştırılıyor...';

  const reader = new FileReader();
  reader.onload = function (event) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 900;
      const MAX_HEIGHT = 900;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width = Math.round((width * MAX_HEIGHT) / height);
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // JPEG %75 kalite ile sıkıştır (Yaklaşık 100-200 KB seviyesine düşer)
      compressedCartoonData = canvas.toDataURL('image/jpeg', 0.75);

      const prev = document.getElementById('ac-preview');
      prev.src = compressedCartoonData;
      prev.style.display = 'block';

      const finalKB = Math.round((compressedCartoonData.length * 3) / 4 / 1024);
      const origKB = Math.round(file.size / 1024);
      infoEl.textContent = `✅ Sıkıştırıldı: ${origKB} KB → ${finalKB} KB (Firestore uyumlu)`;
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

async function addCartoon() {
  if (!isAdmin) return;
  const title = document.getElementById('ac-title').value.trim();
  const desc = document.getElementById('ac-desc').value.trim();
  if (!title || !desc) { showAlert('al-cadd', '❌ Başlık ve açıklama zorunludur!', 'err'); return; }

  const newCartoon = {
    topic: document.getElementById('ac-topic').value,
    emoji: document.getElementById('ac-emoji').value.trim() || '📝',
    imgData: compressedCartoonData || null,
    bubble: document.getElementById('ac-bubble').value.trim(),
    title,
    desc,
    caption: document.getElementById('ac-caption').value.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    const docRef = await db.collection('cartoons').add(newCartoon);
    cartoons.push({ id: docRef.id, ...newCartoon });
    renderCartoons('all');
    updateHomeStats();
    showAlert('al-cadd', '✅ Karikatür buluta kaydedildi!', 'ok');

    ['ac-emoji', 'ac-bubble', 'ac-title', 'ac-desc', 'ac-caption'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('ac-preview').style.display = 'none';
    document.getElementById('ac-file').value = '';
    document.getElementById('ac-compress-info').textContent = '';
    compressedCartoonData = null;
  } catch (e) {
    showAlert('al-cadd', '❌ Kayıt hatası: ' + e.message, 'err');
  }
}

function renderCartoons(filter) {
  const gal = document.getElementById('cartoon-gallery');
  const nd = document.getElementById('no-cartoon');
  const list = filter === 'all' ? cartoons : cartoons.filter(c => c.topic === filter);
  if (!list.length) { gal.innerHTML = ''; nd.style.display = 'block'; return; }
  nd.style.display = 'none';
  gal.innerHTML = list.map(c => `
    <div class="cartoon-item" onclick="openLB('${esc(c.id)}')">
      <div class="cartoon-img">
        ${c.imgData
          ? `<img src="${c.imgData}" alt="${esc(c.title)}">`
          : `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px;width:100%;height:100%;justify-content:center">
              <div style="font-size:4.5rem">${esc(c.emoji || '📝')}</div>
              ${c.bubble ? `<div style="background:#fff;color:#333;border-radius:9px;padding:7px 11px;font-size:0.75rem;font-weight:700;max-width:210px;text-align:center;line-height:1.35">${esc(c.bubble)}</div>` : ''}
            </div>`}
      </div>
      <div class="cartoon-info">
        <div class="ci-topic">${esc(TOPIC_NAMES[c.topic] || c.topic)}</div>
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.desc.substring(0, 95))}${c.desc.length > 95 ? '…' : ''}</p>
      </div>
    </div>`).join('');
}

function filterCartoons(f, btn) {
  document.querySelectorAll('.cf-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCartoons(f);
}

function openLB(id) {
  const c = cartoons.find(x => x.id === id);
  if (!c) return;
  const lbImg = document.getElementById('lb-img');
  if (c.imgData) {
    lbImg.innerHTML = `<img src="${c.imgData}" alt="${esc(c.title)}">`;
  } else {
    lbImg.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;justify-content:center;width:100%;height:100%">
      <div style="font-size:7rem">${esc(c.emoji || '📝')}</div>
      ${c.bubble ? `<div style="background:#fff;color:#333;border-radius:11px;padding:9px 15px;font-size:0.85rem;font-weight:700;max-width:260px;text-align:center">${esc(c.bubble)}</div>` : ''}
    </div>`;
  }
  document.getElementById('lb-topic').textContent = TOPIC_NAMES[c.topic] || c.topic;
  document.getElementById('lb-title').textContent = c.title;
  document.getElementById('lb-desc').textContent = c.desc;
  const cap = document.getElementById('lb-caption');
  if (c.caption) { cap.textContent = c.caption; cap.style.display = 'block'; }
  else cap.style.display = 'none';
  document.getElementById('lightbox').classList.add('open');
}

function closeLB(e) { if (e.target === document.getElementById('lightbox')) closeLightbox(); }
function closeLightbox() { document.getElementById('lightbox').classList.remove('open'); }

// ════════════════════════════════════════════════════════
// HABERLER
// ════════════════════════════════════════════════════════
function renderNews() {
  const grid = document.getElementById('news-grid');
  const noNews = document.getElementById('no-news');
  if (!newsItems.length) { grid.innerHTML = ''; noNews.style.display = 'block'; return; }
  noNews.style.display = 'none';
  grid.innerHTML = '';
  newsItems.forEach(n => {
    const card = document.createElement('div');
    card.className = 'news-card';
    let inner = '';
    if (n.tag) inner += `<div class="news-badge">${esc(n.tag)}</div>`;
    inner += `<div class="news-date">📅 ${esc(n.date || 'Tarih belirtilmedi')}</div>`;
    card.innerHTML = inner;
    const title = document.createElement('h3');
    title.textContent = n.title;
    const content = document.createElement('p');
    content.textContent = n.content;
    card.appendChild(title);
    card.appendChild(content);
    grid.appendChild(card);
  });
}

async function addNews() {
  if (!isAdmin) return;
  const title = document.getElementById('news-title').value.trim();
  const content = document.getElementById('news-content').value.trim();
  if (!title || !content) { showAlert('al-newsadd', '❌ Başlık ve içerik zorunludur!', 'err'); return; }
  const item = {
    title,
    content,
    tag: document.getElementById('news-tag').value.trim(),
    date: document.getElementById('news-date').value,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  try {
    const ref = await db.collection('news').add(item);
    newsItems.unshift({ id: ref.id, ...item });
    renderNews();
    renderNewsList();
    showAlert('al-newsadd', '✅ Haber yayınlandı!', 'ok');
    ['news-title', 'news-content', 'news-tag'].forEach(id => document.getElementById(id).value = '');
  } catch (e) {
    showAlert('al-newsadd', '❌ Hata: ' + e.message, 'err');
  }
}

// ════════════════════════════════════════════════════════
// QUIZ & ANALİZ
// ════════════════════════════════════════════════════════
function buildTopicCheckboxes() {
  const wrap = document.getElementById('topic-checkboxes');
  if (!wrap) return;
  const topics = [...new Set(questions.map(q => q.topic))];
  wrap.innerHTML = topics.map(k => `
    <label class="qo-check"><input type="checkbox" class="topic-check" value="${esc(k)}" checked> ${esc(TOPIC_NAMES[k] || k)}</label>`).join('');
}

function startQuiz() {
  const selTopics = [...document.querySelectorAll('.topic-check:checked')].map(c => c.value);
  const selDiffs = [...document.querySelectorAll('.diff-check:checked')].map(c => c.value);
  const selTypes = [...document.querySelectorAll('.type-check:checked')].map(c => c.value);
  const countVal = document.getElementById('q-count').value;
  const alertEl = document.getElementById('quiz-start-alert');

  if (!selTopics.length) { alertEl.textContent = 'En az bir konu seçmelisin!'; return; }
  if (!selDiffs.length) { alertEl.textContent = 'En az bir zorluk seviyesi seçmelisin!'; return; }
  if (!selTypes.length) { alertEl.textContent = 'En az bir soru tipi seçmelisin!'; return; }
  alertEl.textContent = '';

  let pool = questions.filter(q => selTopics.includes(q.topic) && selDiffs.includes(q.difficulty) && selTypes.includes(q.type || 'mc'));
  if (!pool.length) { alertEl.textContent = 'Seçilen kriterlere uygun soru bulunamadı!'; return; }

  pool = pool.sort(() => Math.random() - 0.5);
  if (countVal !== 'all') pool = pool.slice(0, parseInt(countVal));

  activeQuestions = pool;
  currentQ = 0;
  score = 0;
  answered = [];
  quizScoreAdded = false;

  document.getElementById('quiz-start').style.display = 'none';
  document.getElementById('quiz-active').style.display = 'block';
  document.getElementById('quiz-done').style.display = 'none';
  document.getElementById('qz-tot').textContent = activeQuestions.length;
  renderQ();
}

function backToStart() {
  document.getElementById('quiz-start').style.display = 'block';
  document.getElementById('quiz-active').style.display = 'none';
}

async function finishQuiz() {
  document.getElementById('qz-container').style.display = 'none';
  document.getElementById('quiz-done').style.display = 'block';
  document.getElementById('qz-final').textContent = score;
  if (!quizScoreAdded) {
    totalScore += score;
    quizScoreAdded = true;
    updateHomeStats();
    await saveUserProgressToFirestore();
  }
}

function renderQ() {
  const con = document.getElementById('qz-container');
  if (currentQ >= activeQuestions.length) {
    finishQuiz();
    return;
  }
  con.style.display = 'block';
  const q = activeQuestions[currentQ];
  const ans = answered[currentQ];
  const done = ans !== undefined;
  const pct = Math.round((currentQ / activeQuestions.length) * 100);
  document.getElementById('qz-idx').textContent = currentQ + 1;
  document.getElementById('qz-pct').textContent = pct + '%';
  document.getElementById('qz-fill').style.width = pct + '%';
  document.getElementById('qz-score').textContent = score;

  const isTF = (q.type === 'tf');
  let optsHtml = isTF ? `<div class="opts tf-opts">
    <button class="opt ${done ? ((q.tfCorrect ? 1 : 0) === 1 ? 'correct' : (ans === 1 ? 'wrong' : '')) : ''}" onclick="answerQ(1)" ${done ? 'disabled' : ''}>✅ Doğru</button>
    <button class="opt ${done ? ((q.tfCorrect ? 1 : 0) === 0 ? 'correct' : (ans === 0 ? 'wrong' : '')) : ''}" onclick="answerQ(0)" ${done ? 'disabled' : ''}>❌ Yanlış</button>
  </div>` :
    `<div class="opts">${q.options.map((o, i) => `
    <button class="opt ${done ? (i === q.correct ? 'correct' : (i === ans ? 'wrong' : '')) : ''}" onclick="answerQ(${i})" ${done ? 'disabled' : ''}>
      <span style="color:var(--accent);font-weight:800;margin-right:5px">${'ABCD'[i]})</span>${esc(o)}
    </button>`).join('')}</div>`;

  con.innerHTML = `
    <div class="q-card">
      <div class="q-meta">
        <span class="badge badge-t">${esc(TOPIC_NAMES[q.topic] || q.topic)}</span>
        <span class="badge badge-d">${esc(q.difficulty)}</span>
        <span class="badge badge-type">${isTF ? 'D/Y' : 'Çoktan Seçmeli'}</span>
      </div>
      <div class="q-text">${currentQ + 1}. ${esc(q.text)}</div>
      ${optsHtml}
      <div class="expl ${done ? 'show' : ''}">💡 ${esc(q.explanation)}</div>
    </div>
    <div class="q-actions">
      ${currentQ > 0 ? `<button class="btn btn-outline btn-sm" onclick="prevQ()">← Önceki</button>` : ''}
      ${done ? `<button class="btn btn-green btn-sm" onclick="nextQ()">Sonraki →</button>` : ''}
    </div>`;
}

function answerQ(i) {
  if (answered[currentQ] !== undefined) return;
  const q = activeQuestions[currentQ];
  answered[currentQ] = i;
  if (!quizResults[q.topic]) quizResults[q.topic] = { correct: 0, wrong: 0 };
  const correct = (q.type === 'tf') ? (i === (q.tfCorrect ? 1 : 0)) : (i === q.correct);
  if (correct) { score += 10; quizResults[q.topic].correct++; }
  else quizResults[q.topic].wrong++;
  renderQ();
}

function nextQ() {
  if (currentQ < activeQuestions.length - 1) {
    currentQ++;
    renderQ();
  } else {
    finishQuiz();
  }
}

function prevQ() { if (currentQ > 0) { currentQ--; renderQ(); } }

function renderAnalysis() {
  let tc = 0, tw = 0;
  Object.values(quizResults).forEach(r => { tc += r.correct; tw += r.wrong; });
  const tot = tc + tw, rate = tot > 0 ? Math.round(tc / tot * 100) : 0;
  document.getElementById('an-stats').innerHTML = `
    <div class="an-card"><div class="an-num" style="color:var(--accent)">${tot}</div><div class="an-lbl">Çözülen Soru</div></div>
    <div class="an-card"><div class="an-num" style="color:var(--green)">${tc}</div><div class="an-lbl">Doğru</div></div>
    <div class="an-card"><div class="an-num" style="color:var(--red)">${tw}</div><div class="an-lbl">Yanlış</div></div>
    <div class="an-card"><div class="an-num" style="color:${rate >= 70 ? 'var(--green)' : rate >= 40 ? 'var(--accent)' : 'var(--red)'}">${rate}%</div><div class="an-lbl">Başarı Oranı</div></div>`;

  const allT = { ...Object.fromEntries([...new Set(questions.map(q => q.topic))].map(k => [k, TOPIC_NAMES[k] || k])) };
  let bars = '<div class="items-list"><h3>Konulara Göre Başarı</h3>';
  Object.entries(allT).forEach(([k, v]) => {
    const r = quizResults[k] || { correct: 0, wrong: 0 };
    const t = r.correct + r.wrong;
    const p = t > 0 ? Math.round(r.correct / t * 100) : null;
    const cls = p === null ? '' : p >= 70 ? 'fill-strong' : p >= 40 ? 'fill-medium' : 'fill-weak';
    bars += `<div class="topic-bar-wrap"><div class="tbw-label"><span>${esc(v)}</span><span>${p !== null ? p + '%' : 'Çözülmedi'}</span></div><div class="tbw-bar"><div class="tbw-fill ${cls}" style="width:${p || 0}%"></div></div></div>`;
  });
  bars += '</div>';

  let sugs = '<div class="items-list"><h3>💡 Öneriler</h3>';
  let hasSug = false;
  Object.entries(allT).forEach(([k, v]) => {
    const r = quizResults[k] || { correct: 0, wrong: 0 };
    const t = r.correct + r.wrong;
    const p = t > 0 ? Math.round(r.correct / t * 100) : null;
    if (p !== null && p < 60) {
      hasSug = true;
      sugs += `<div class="sug-item"><div class="sug-icon">⚠️</div><div><div class="sug-title">${esc(v)} konusunu tekrar et</div><div class="sug-text">Başarı oranın %${p}. Konu anlatımı bölümünü incele.</div></div></div>`;
    }
  });
  if (!hasSug && tot === 0) sugs += '<div class="sug-item"><div class="sug-icon">👋</div><div><div class="sug-title">Henüz quiz çözmedin</div><div class="sug-text">Quiz bölümünden soru çöz!</div></div></div>';
  else if (!hasSug) sugs += '<div class="sug-item"><div class="sug-icon">🎉</div><div><div class="sug-title">Tüm konularda başarılısın!</div><div class="sug-text">Harika iş çıkardın!</div></div></div>';
  sugs += '</div>';
  document.getElementById('an-details').innerHTML = bars + sugs;
}

// ════════════════════════════════════════════════════════
// YÖNETİCİ PANELİ İŞLEMLERİ & TOPLU SORU YÜKLEME
// ════════════════════════════════════════════════════════
function showAdmPanel(id, btn) {
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.asb-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('adm-' + id);
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
  if (id === 'q-list') renderQList();
  if (id === 'c-list') renderCList();
  if (id === 'news-list') renderNewsList();
  if (id === 'block-list') renderBlockList();
  if (id === 'users') renderUsersList();
}

function buildAdminTopicSelects() {
  const topics = Object.keys(TOPIC_NAMES).filter(k => !['nokta', 'virgul', 'noktali-virgul', 'iki-nokta', 'uc-nokta', 'soru', 'unlem'].includes(k));
  const allTopics = Object.keys(TOPIC_NAMES);
  ['aq-topic', 'ac-topic'].forEach(sid => {
    const sel = document.getElementById(sid);
    if (!sel) return;
    const opts = (sid === 'ac-topic' ? allTopics : topics);
    sel.innerHTML = opts.map(k => `<option value="${esc(k)}">${esc(TOPIC_NAMES[k] || k)}</option>`).join('');
  });
}

function toggleQType() {
  const t = document.getElementById('aq-type').value;
  document.getElementById('mc-opts').style.display = t === 'mc' ? 'block' : 'none';
  document.getElementById('tf-opts').style.display = t === 'tf' ? 'block' : 'none';
}

async function addQuestion() {
  if (!isAdmin) return;
  const text = document.getElementById('aq-text').value.trim();
  const qtype = document.getElementById('aq-type').value;
  if (!text) { showAlert('al-qadd', '❌ Soru metni zorunludur!', 'err'); return; }

  let q = {
    topic: document.getElementById('aq-topic').value,
    difficulty: document.getElementById('aq-diff').value,
    type: qtype,
    text,
    explanation: document.getElementById('aq-expl').value.trim() || 'Açıklama eklenmemiş.',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (qtype === 'mc') {
    const opts = [document.getElementById('oa').value.trim(), document.getElementById('ob').value.trim(), document.getElementById('oc').value.trim(), document.getElementById('od').value.trim()];
    const cr = document.querySelector('input[name="cr"]:checked');
    if (opts.some(o => !o) || !cr) { showAlert('al-qadd', '❌ Tüm seçenekleri ve doğru cevabı seçin!', 'err'); return; }
    q.options = opts;
    q.correct = parseInt(cr.value);
    cr.checked = false;
    ['oa', 'ob', 'oc', 'od'].forEach(id => document.getElementById(id).value = '');
  } else {
    const tfAns = document.querySelector('input[name="tf-ans"]:checked');
    if (!tfAns) { showAlert('al-qadd', '❌ Doğru/Yanlış cevabı seçin!', 'err'); return; }
    q.tfCorrect = tfAns.value === '1';
    tfAns.checked = false;
  }

  try {
    const ref = await db.collection('questions').add(q);
    questions.push({ id: ref.id, ...q });
    updateHomeStats();
    buildTopicCheckboxes();
    showAlert('al-qadd', '✅ Soru buluta eklendi!', 'ok');
    document.getElementById('aq-text').value = '';
    document.getElementById('aq-expl').value = '';
  } catch (e) {
    showAlert('al-qadd', '❌ Hata: ' + e.message, 'err');
  }
}

// TOPLU SORU YÜKLEME FONKSİYONLARI
function loadBulkFile(inp) {
  const file = inp.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('bulk-json-text').value = e.target.result;
  };
  reader.readAsText(file);
}

async function uploadBulkQuestions() {
  if (!isAdmin) return;
  const raw = document.getElementById('bulk-json-text').value.trim();
  if (!raw) { showAlert('al-qbulk', '❌ Lütfen JSON verisi girin veya dosya seçin!', 'err'); return; }

  let parsed;
  try {
    parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Veri bir JSON dizisi ([...]) olmalıdır.');
  } catch (e) {
    showAlert('al-qbulk', '❌ Geçersiz JSON formatı: ' + e.message, 'err');
    return;
  }

  showAlert('al-qbulk', `⏳ ${parsed.length} soru yükleniyor, lütfen bekleyin...`, 'ok');

  let addedCount = 0;
  const batch = db.batch();

  parsed.forEach(item => {
    if (!item.text || !item.topic) return;
    const docRef = db.collection('questions').doc();
    const qObj = {
      topic: item.topic,
      difficulty: item.difficulty || 'Orta',
      type: item.type || 'mc',
      text: item.text,
      explanation: item.explanation || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (qObj.type === 'tf') {
      qObj.tfCorrect = Boolean(item.tfCorrect);
    } else {
      qObj.options = item.options || ['', '', '', ''];
      qObj.correct = Number(item.correct) || 0;
    }
    batch.set(docRef, qObj);
    questions.push({ id: docRef.id, ...qObj });
    addedCount++;
  });

  try {
    await batch.commit();
    updateHomeStats();
    buildTopicCheckboxes();
    document.getElementById('bulk-json-text').value = '';
    document.getElementById('bulk-file').value = '';
    showAlert('al-qbulk', `✅ Toplam ${addedCount} soru başarıyla eklendi!`, 'ok');
  } catch (e) {
    showAlert('al-qbulk', '❌ Toplu yükleme hatası: ' + e.message, 'err');
  }
}

function renderQList() {
  const w = document.getElementById('q-list-wrap');
  const badge = document.getElementById('q-total-badge');
  if (badge) badge.textContent = questions.length;
  if (!w) return;
  if (!questions.length) { w.innerHTML = '<p style="color:var(--muted)">Henüz soru yok.</p>'; return; }
  w.innerHTML = questions.map(q => `
    <div class="li-item">
      <div class="li-item-text">
        <div class="li-top">${esc(TOPIC_NAMES[q.topic] || q.topic)} · ${esc(q.difficulty)} · ${q.type === 'tf' ? 'D/Y' : 'Çoktan Seçmeli'}</div>
        <div class="li-main">${esc(q.text.substring(0, 75))}${q.text.length > 75 ? '…' : ''}</div>
      </div>
      <div class="li-actions">
        ${!q.id.startsWith('q') ? `<button class="ic-btn del" onclick="delQ('${esc(q.id)}')">🗑️</button>` : '<span style="font-size:0.7rem;color:var(--muted)">Sabit</span>'}
      </div>
    </div>`).join('');
}

async function delQ(id) {
  if (!confirm('Bu soruyu silmek istiyor musunuz?')) return;
  try {
    await db.collection('questions').doc(id).delete();
    questions = questions.filter(q => q.id !== id);
    renderQList();
    updateHomeStats();
  } catch (e) {
    alert('Silinemedi: ' + e.message);
  }
}

function renderCList() {
  const w = document.getElementById('c-list-wrap');
  if (!w) return;
  w.innerHTML = cartoons.map(c => `
    <div class="li-item">
      <div class="li-item-text"><div class="li-top">${esc(TOPIC_NAMES[c.topic] || c.topic)}</div><div class="li-main">${esc(c.emoji)} ${esc(c.title)}</div></div>
      <div class="li-actions">
        ${!c.id.startsWith('c') ? `<button class="ic-btn del" onclick="delC('${esc(c.id)}')">🗑️</button>` : '<span style="font-size:0.7rem;color:var(--muted)">Sabit</span>'}
      </div>
    </div>`).join('');
}

async function delC(id) {
  if (!confirm('Bu karikatürü silmek istiyor musunuz?')) return;
  try {
    await db.collection('cartoons').doc(id).delete();
    cartoons = cartoons.filter(c => c.id !== id);
    renderCList();
    renderCartoons('all');
    updateHomeStats();
  } catch (e) {
    alert('Silinemedi: ' + e.message);
  }
}

async function saveBlock() {
  if (!isAdmin) return;
  const section = document.getElementById('block-section').value;
  const sub = document.getElementById('block-sub').value;
  const title = document.getElementById('block-title').value.trim();
  const content = document.getElementById('block-content').value.trim();
  if (!title || !content) { showAlert('al-blockadd', '❌ Başlık ve içerik zorunludur!', 'err'); return; }

  const bl = {
    section, sub, title, content,
    exGood: document.getElementById('block-good').value.trim(),
    exBad: document.getElementById('block-bad').value.trim(),
    emoji: document.getElementById('block-emoji').value.trim(),
    bubble: document.getElementById('block-bubble').value.trim(),
    note: document.getElementById('block-note').value.trim(),
    isDefault: false, isTable: false
  };

  try {
    const ref = await db.collection('blocks').add(bl);
    contentBlocks.push({ id: ref.id, ...bl });
    renderAll();
    cancelBlockEdit();
    showAlert('al-blockadd', '✅ İçerik bloğu eklendi!', 'ok');
  } catch (e) {
    showAlert('al-blockadd', '❌ Hata: ' + e.message, 'err');
  }
}

async function deleteBlock(id) {
  if (!confirm('Bu içerik bloğunu silmek istiyor musunuz?')) return;
  try {
    await db.collection('blocks').doc(id).delete();
    contentBlocks = contentBlocks.filter(b => b.id !== id);
    renderAll();
    renderBlockList();
  } catch (e) {
    alert('Silinemedi: ' + e.message);
  }
}

function cancelBlockEdit() {
  document.getElementById('block-edit-id').value = '';
  ['block-title', 'block-content', 'block-good', 'block-bad', 'block-emoji', 'block-bubble', 'block-note'].forEach(i => document.getElementById(i).value = '');
}

function renderBlockList() {
  const w = document.getElementById('block-list-wrap');
  if (!w) return;
  w.innerHTML = contentBlocks.map(bl => `
    <div class="li-item">
      <div class="li-item-text">
        <div class="li-top">${esc(bl.section)} › ${esc(bl.sub)}</div>
        <div class="li-main">${esc(bl.title.substring(0, 70))}</div>
      </div>
      <div class="li-actions">
        ${!bl.isDefault ? `<button class="ic-btn del" onclick="deleteBlock('${esc(bl.id)}')">🗑️</button>` : '<span style="font-size:0.7rem;color:var(--muted)">Sabit</span>'}
      </div>
    </div>`).join('');
}

function renderNewsList() {
  const w = document.getElementById('news-list-wrap');
  if (!w) return;
  if (!newsItems.length) { w.innerHTML = '<p style="color:var(--muted)">Henüz haber yok.</p>'; return; }
  w.innerHTML = newsItems.map(n => `
    <div class="li-item">
      <div class="li-item-text"><div class="li-top">${esc(n.tag || 'Haber')} · ${esc(n.date || '')}</div><div class="li-main">${esc(n.title.substring(0, 70))}</div></div>
      <div class="li-actions"><button class="ic-btn del" onclick="delNews('${esc(n.id)}')">🗑️</button></div>
    </div>`).join('');
}

async function delNews(id) {
  if (!confirm('Bu haberi silmek istiyor musunuz?')) return;
  try {
    await db.collection('news').doc(id).delete();
    newsItems = newsItems.filter(n => n.id !== id);
    renderNews();
    renderNewsList();
  } catch (e) {
    alert('Silinemedi: ' + e.message);
  }
}

async function renderUsersList() {
  const w = document.getElementById('users-list-wrap');
  if (!w) return;
  w.innerHTML = '<p style="color:var(--muted)">Kullanıcılar yükleniyor...</p>';
  try {
    const snap = await db.collection('users').orderBy('totalScore', 'desc').get();
    if (snap.empty) { w.innerHTML = '<p style="color:var(--muted)">Henüz kullanıcı yok.</p>'; return; }
    w.innerHTML = snap.docs.map(doc => {
      const u = doc.data();
      return `
      <div class="li-item">
        <div class="li-item-text">
          <div class="li-top">${esc(u.email)} · ⭐ ${u.totalScore || 0} puan</div>
          <div class="li-main">👤 ${esc(u.fullname)}</div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    w.innerHTML = '<p style="color:var(--red)">Kullanıcı listesi alınamadı.</p>';
  }
}

function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'al ' + (type === 'ok' ? 'ok' : 'err');
  el.textContent = msg;
  setTimeout(() => el.className = 'al', 4000);
}// ════════════════════════════════════════════════════════
// XSS KORUMA YARDIMCISI
// ════════════════════════════════════════════════════════
function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

// ════════════════════════════════════════════════════════
// UYGULAMA DURUMU (STATE - LOCALSTORAGE YOK, FIRESTORE TABANLI)
// ════════════════════════════════════════════════════════
let currentUser = null;
let isAdmin = false;
let questions = [...DEFAULT_QUESTIONS];
let cartoons = [...DEFAULT_CARTOONS];
let newsItems = [];
let contentBlocks = [...DEFAULT_BLOCKS];
let allUsersData = [];

let quizResults = {};
let totalScore = 0;

let currentQ = 0, score = 0, answered = [], activeQuestions = [];
let quizScoreAdded = false;
let compressedCartoonData = null;

// ════════════════════════════════════════════════════════
// FIREBASE AUTH & OTURUM YÖNETİMİ
// ════════════════════════════════════════════════════════
function showSplashAlert(msg) {
  const el = document.getElementById('splash-alert');
  if (el) {
    el.textContent = msg;
    setTimeout(() => el.textContent = '', 4500);
  }
}

function loginWithGoogle() {
  auth.signInWithPopup(googleProvider)
    .catch((error) => {
      console.error("Giriş hatası:", error);
      showSplashAlert('❌ Google ile giriş yapılamadı: ' + error.message);
    });
}

function logout() {
  auth.signOut().then(() => {
    currentUser = null;
    isAdmin = false;
    quizResults = {};
    totalScore = 0;
    document.getElementById('splash').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.body.classList.remove('admin-logged');
  });
}

// Oturum durumunu dinle
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = {
      uid: user.uid,
      fullname: user.displayName || user.email.split('@')[0],
      email: user.email
    };

    // Önceden belirlenen yönetici maili mi kontrol et
    isAdmin = (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());

    await loadUserDataFromFirestore();
    await loadSharedDataFromFirestore();

    startApp();
  } else {
    document.getElementById('splash').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  }
});

// ════════════════════════════════════════════════════════
// FIRESTORE VERİ YÜKLEME & KAYDETME
// ════════════════════════════════════════════════════════
async function loadUserDataFromFirestore() {
  if (!currentUser) return;
  try {
    const userRef = db.collection('users').doc(currentUser.uid);
    const doc = await userRef.get();
    if (doc.exists) {
      const data = doc.data();
      totalScore = data.totalScore || 0;
      quizResults = data.quizResults || {};
    } else {
      totalScore = 0;
      quizResults = {};
      await userRef.set({
        uid: currentUser.uid,
        fullname: currentUser.fullname,
        email: currentUser.email,
        totalScore: 0,
        quizResults: {},
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }
  } catch (e) {
    console.error("Kullanıcı verisi yüklenemedi:", e);
  }
}

async function saveUserProgressToFirestore() {
  if (!currentUser) return;
  try {
    await db.collection('users').doc(currentUser.uid).set({
      uid: currentUser.uid,
      fullname: currentUser.fullname,
      email: currentUser.email,
      totalScore: totalScore,
      quizResults: quizResults,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.error("İlerleme kaydedilemedi:", e);
  }
}

async function loadSharedDataFromFirestore() {
  try {
    // 1. Soruları Yükle (Varsayılan sorular + Firestore'dan gelen sorular)
    const qSnap = await db.collection('questions').get();
    const dbQuestions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    questions = [...DEFAULT_QUESTIONS, ...dbQuestions];

    // 2. Karikatürleri Yükle
    const cSnap = await db.collection('cartoons').get();
    const dbCartoons = cSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    cartoons = [...DEFAULT_CARTOONS, ...dbCartoons];

    // 3. Haberleri Yükle
    const nSnap = await db.collection('news').orderBy('createdAt', 'desc').get();
    newsItems = nSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // 4. İçerik Bloklarını Yükle
    const bSnap = await db.collection('blocks').get();
    const dbBlocks = bSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    contentBlocks = [...DEFAULT_BLOCKS, ...dbBlocks];
  } catch (e) {
    console.error("Ortak veriler çekilirken hata:", e);
  }
}

function startApp() {
  document.getElementById('splash').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('header-name').textContent = currentUser.fullname;
  document.getElementById('header-score').textContent = totalScore;

  const adminBtn = document.getElementById('admin-nav-btn');
  if (isAdmin) {
    adminBtn.style.display = '';
    document.body.classList.add('admin-logged');
  } else {
    adminBtn.style.display = 'none';
    document.body.classList.remove('admin-logged');
  }

  const nd = document.getElementById('news-date');
  if (nd) nd.value = new Date().toISOString().split('T')[0];

  renderAll();
  buildTopicCheckboxes();
  buildAdminTopicSelects();
  showPage('home', document.querySelector('.nav-btn'));
}

// ════════════════════════════════════════════════════════
// RENDER & NAVİGASYON
// ════════════════════════════════════════════════════════
function renderAll() {
  renderTopics();
  renderTdk();
  renderCartoons('all');
  renderNews();
  updateHomeStats();
}

function updateHomeStats() {
  document.getElementById('hs-soru').textContent = questions.length;
  document.getElementById('hs-karik').textContent = cartoons.length;
  document.getElementById('hs-puan').textContent = totalScore;
  document.getElementById('header-score').textContent = totalScore;
}

function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (btn) btn.classList.add('active');
  if (id === 'analysis') renderAnalysis();
  if (id === 'quiz') buildTopicCheckboxes();
  if (id === 'admin' && isAdmin) {
    buildAdminTopicSelects();
    showAdmPanel('q-add', document.querySelector('.asb-btn'));
  }
  window.scrollTo(0, 0);
}

// ════════════════════════════════════════════════════════
// KONU ANLATIMI & TDK BLOKLARI
// ════════════════════════════════════════════════════════
function renderTopics() {
  const sections = ['topics-yazim', 'topics-noktalama'];
  const subMap = {
    'topics-yazim': ['buyuk-harf', 'sayilar', 'de-ki-mi', 'birlesik', 'kisaltma', 'karisik'],
    'topics-noktalama': ['nokta', 'virgul', 'noktali-virgul', 'iki-nokta', 'uc-nokta', 'soru', 'unlem']
  };
  const tabMap = { 'topics-yazim': 'yazim', 'topics-noktalama': 'noktalama' };

  sections.forEach(sec => {
    const tab = tabMap[sec];
    const sidebar = document.getElementById('sidebar-' + tab);
    const contentArea = document.getElementById('content-' + tab);
    if (!sidebar || !contentArea) return;
    const subs = subMap[sec];
    sidebar.innerHTML = '';
    contentArea.innerHTML = '';
    subs.forEach((sub, idx) => {
      const name = TOPIC_NAMES[sub] || sub;
      const btn = document.createElement('button');
      btn.className = 'topic-link' + (idx === 0 ? ' active' : '');
      btn.textContent = name;
      btn.onclick = () => showSubTopic(tab, sub);
      sidebar.appendChild(btn);

      const div = document.createElement('div');
      div.id = 'tsec-' + tab + '-' + sub;
      div.style.display = idx === 0 ? 'block' : 'none';
      const blocks = contentBlocks.filter(b => b.section === sec && b.sub === sub);
      blocks.forEach(bl => { div.appendChild(buildBlockEl(bl, true)); });
      contentArea.appendChild(div);
    });
  });
}

function renderTdk() {
  ['tdk-yazim', 'tdk-noktalama'].forEach(sec => {
    const wrap = document.getElementById(sec + '-blocks');
    if (!wrap) return;
    wrap.innerHTML = '';
    const blocks = contentBlocks.filter(b => b.section === sec);
    blocks.forEach(bl => wrap.appendChild(buildBlockEl(bl, false)));
  });
}

function buildBlockEl(bl, withAdminBar) {
  const div = document.createElement('div');
  div.className = 'content-block';
  div.dataset.blockId = bl.id;

  if (withAdminBar && !bl.isDefault) {
    const bar = document.createElement('div');
    bar.className = 'cb-admin-bar';
    bar.innerHTML = `<button class="cb-btn del" onclick="deleteBlock('${esc(bl.id)}')">🗑️ Sil</button>`;
    div.appendChild(bar);
  }

  const h3 = document.createElement('h3');
  h3.textContent = bl.title;
  div.appendChild(h3);

  if (bl.isTable) {
    const p = document.createElement('p');
    p.style.cssText = 'font-size:0.83rem;color:var(--muted);margin-bottom:12px;font-family:"Lora",serif';
    p.textContent = "TDK'ya göre doğru ve yanlış yazımlar:";
    div.appendChild(p);
    const tbl = document.createElement('table');
    tbl.className = 'compare-table';
    tbl.innerHTML = '<thead><tr><th>Yanlış ❌</th><th>Doğru ✅</th><th>Açıklama</th></tr></thead>';
    const tbody = document.createElement('tbody');
    KARISIK_TABLE.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="wrong">${esc(r[0])}</td><td class="right">${esc(r[1])}</td><td>${esc(r[2])}</td>`;
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    div.appendChild(tbl);
  } else {
    const lines = (bl.content || '').split('\n').filter(l => l.trim());
    if (lines.length > 1) {
      const ul = document.createElement('ul');
      ul.className = 'rule-list';
      lines.forEach(l => {
        const li = document.createElement('li');
        li.textContent = l;
        ul.appendChild(li);
      });
      div.appendChild(ul);
    } else if (lines.length === 1) {
      const p = document.createElement('p');
      p.style.cssText = 'font-family:"Lora",serif;line-height:1.7;font-size:0.95rem';
      p.textContent = lines[0];
      div.appendChild(p);
    }
  }

  if (bl.exGood || bl.exBad) {
    const ex = document.createElement('div');
    ex.className = 'example-box';
    if (bl.exGood) { const s = document.createElement('span'); s.className = 'ex-good'; s.textContent = '✅ ' + bl.exGood; ex.appendChild(s); ex.appendChild(document.createElement('br')); }
    if (bl.exBad) { const s = document.createElement('span'); s.className = 'ex-bad'; s.textContent = '❌ ' + bl.exBad; ex.appendChild(s); }
    div.appendChild(ex);
  }
  if (bl.note) { const nb = document.createElement('div'); nb.className = 'note-box'; nb.textContent = bl.note; div.appendChild(nb); }
  if (bl.emoji && bl.bubble) {
    const mc = document.createElement('div');
    mc.className = 'mini-cartoon';
    mc.innerHTML = `<div class="mc-emoji">${esc(bl.emoji)}</div><div class="mc-bubble">${esc(bl.bubble)}</div>`;
    div.appendChild(mc);
  }
  return div;
}

function showSubTopic(tab, sub) {
  const area = document.getElementById('topic-tab-' + tab);
  if (!area) return;
  area.querySelectorAll('[id^="tsec-' + tab + '-"]').forEach(d => d.style.display = 'none');
  area.querySelectorAll('.topic-link').forEach(b => b.classList.remove('active'));
  const sec = document.getElementById('tsec-' + tab + '-' + sub);
  if (sec) sec.style.display = 'block';
  const name = TOPIC_NAMES[sub] || sub;
  area.querySelectorAll('.topic-link').forEach(b => {
    if (b.textContent.trim() === name) b.classList.add('active');
  });
}

function setTopicTab(tab, btn) {
  document.querySelectorAll('.topic-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.topic-main-area').forEach(a => a.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const el = document.getElementById('topic-tab-' + tab);
  if (el) el.classList.add('active');
}

function setTdkTab(id, btn) {
  document.querySelectorAll('.tdk-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tdk-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tdk-' + id).classList.add('active');
  btn.classList.add('active');
}

function goTopicTab(tab, sub) {
  showPage('topics', document.querySelectorAll('.nav-btn')[1]);
  setTimeout(() => {
    setTopicTab(tab, null);
    setTimeout(() => showSubTopic(tab, sub), 60);
  }, 60);
}

// ════════════════════════════════════════════════════════
// KARİKATÜRLER & OTOMATİK GÖRSEL SIKIŞTIRMA (CANVAS)
// ════════════════════════════════════════════════════════
function previewAndCompressImage(inp) {
  const file = inp.files[0];
  if (!file) return;

  if (file.size > 10 * 1024 * 1024) {
    alert('Lütfen 10MB\'dan küçük bir görsel seçin.');
    inp.value = '';
    return;
  }

  const infoEl = document.getElementById('ac-compress-info');
  infoEl.textContent = '⏳ Görsel sıkıştırılıyor...';

  const reader = new FileReader();
  reader.onload = function (event) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 900;
      const MAX_HEIGHT = 900;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width = Math.round((width * MAX_HEIGHT) / height);
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // JPEG %75 kalite ile sıkıştır (Yaklaşık 100-200 KB seviyesine düşer)
      compressedCartoonData = canvas.toDataURL('image/jpeg', 0.75);

      const prev = document.getElementById('ac-preview');
      prev.src = compressedCartoonData;
      prev.style.display = 'block';

      const finalKB = Math.round((compressedCartoonData.length * 3) / 4 / 1024);
      const origKB = Math.round(file.size / 1024);
      infoEl.textContent = `✅ Sıkıştırıldı: ${origKB} KB → ${finalKB} KB (Firestore uyumlu)`;
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

async function addCartoon() {
  if (!isAdmin) return;
  const title = document.getElementById('ac-title').value.trim();
  const desc = document.getElementById('ac-desc').value.trim();
  if (!title || !desc) { showAlert('al-cadd', '❌ Başlık ve açıklama zorunludur!', 'err'); return; }

  const newCartoon = {
    topic: document.getElementById('ac-topic').value,
    emoji: document.getElementById('ac-emoji').value.trim() || '📝',
    imgData: compressedCartoonData || null,
    bubble: document.getElementById('ac-bubble').value.trim(),
    title,
    desc,
    caption: document.getElementById('ac-caption').value.trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    const docRef = await db.collection('cartoons').add(newCartoon);
    cartoons.push({ id: docRef.id, ...newCartoon });
    renderCartoons('all');
    updateHomeStats();
    showAlert('al-cadd', '✅ Karikatür buluta kaydedildi!', 'ok');

    ['ac-emoji', 'ac-bubble', 'ac-title', 'ac-desc', 'ac-caption'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('ac-preview').style.display = 'none';
    document.getElementById('ac-file').value = '';
    document.getElementById('ac-compress-info').textContent = '';
    compressedCartoonData = null;
  } catch (e) {
    showAlert('al-cadd', '❌ Kayıt hatası: ' + e.message, 'err');
  }
}

function renderCartoons(filter) {
  const gal = document.getElementById('cartoon-gallery');
  const nd = document.getElementById('no-cartoon');
  const list = filter === 'all' ? cartoons : cartoons.filter(c => c.topic === filter);
  if (!list.length) { gal.innerHTML = ''; nd.style.display = 'block'; return; }
  nd.style.display = 'none';
  gal.innerHTML = list.map(c => `
    <div class="cartoon-item" onclick="openLB('${esc(c.id)}')">
      <div class="cartoon-img">
        ${c.imgData
          ? `<img src="${c.imgData}" alt="${esc(c.title)}">`
          : `<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px;width:100%;height:100%;justify-content:center">
              <div style="font-size:4.5rem">${esc(c.emoji || '📝')}</div>
              ${c.bubble ? `<div style="background:#fff;color:#333;border-radius:9px;padding:7px 11px;font-size:0.75rem;font-weight:700;max-width:210px;text-align:center;line-height:1.35">${esc(c.bubble)}</div>` : ''}
            </div>`}
      </div>
      <div class="cartoon-info">
        <div class="ci-topic">${esc(TOPIC_NAMES[c.topic] || c.topic)}</div>
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.desc.substring(0, 95))}${c.desc.length > 95 ? '…' : ''}</p>
      </div>
    </div>`).join('');
}

function filterCartoons(f, btn) {
  document.querySelectorAll('.cf-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCartoons(f);
}

function openLB(id) {
  const c = cartoons.find(x => x.id === id);
  if (!c) return;
  const lbImg = document.getElementById('lb-img');
  if (c.imgData) {
    lbImg.innerHTML = `<img src="${c.imgData}" alt="${esc(c.title)}">`;
  } else {
    lbImg.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;justify-content:center;width:100%;height:100%">
      <div style="font-size:7rem">${esc(c.emoji || '📝')}</div>
      ${c.bubble ? `<div style="background:#fff;color:#333;border-radius:11px;padding:9px 15px;font-size:0.85rem;font-weight:700;max-width:260px;text-align:center">${esc(c.bubble)}</div>` : ''}
    </div>`;
  }
  document.getElementById('lb-topic').textContent = TOPIC_NAMES[c.topic] || c.topic;
  document.getElementById('lb-title').textContent = c.title;
  document.getElementById('lb-desc').textContent = c.desc;
  const cap = document.getElementById('lb-caption');
  if (c.caption) { cap.textContent = c.caption; cap.style.display = 'block'; }
  else cap.style.display = 'none';
  document.getElementById('lightbox').classList.add('open');
}

function closeLB(e) { if (e.target === document.getElementById('lightbox')) closeLightbox(); }
function closeLightbox() { document.getElementById('lightbox').classList.remove('open'); }

// ════════════════════════════════════════════════════════
// HABERLER
// ════════════════════════════════════════════════════════
function renderNews() {
  const grid = document.getElementById('news-grid');
  const noNews = document.getElementById('no-news');
  if (!newsItems.length) { grid.innerHTML = ''; noNews.style.display = 'block'; return; }
  noNews.style.display = 'none';
  grid.innerHTML = '';
  newsItems.forEach(n => {
    const card = document.createElement('div');
    card.className = 'news-card';
    let inner = '';
    if (n.tag) inner += `<div class="news-badge">${esc(n.tag)}</div>`;
    inner += `<div class="news-date">📅 ${esc(n.date || 'Tarih belirtilmedi')}</div>`;
    card.innerHTML = inner;
    const title = document.createElement('h3');
    title.textContent = n.title;
    const content = document.createElement('p');
    content.textContent = n.content;
    card.appendChild(title);
    card.appendChild(content);
    grid.appendChild(card);
  });
}

async function addNews() {
  if (!isAdmin) return;
  const title = document.getElementById('news-title').value.trim();
  const content = document.getElementById('news-content').value.trim();
  if (!title || !content) { showAlert('al-newsadd', '❌ Başlık ve içerik zorunludur!', 'err'); return; }
  const item = {
    title,
    content,
    tag: document.getElementById('news-tag').value.trim(),
    date: document.getElementById('news-date').value,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  try {
    const ref = await db.collection('news').add(item);
    newsItems.unshift({ id: ref.id, ...item });
    renderNews();
    renderNewsList();
    showAlert('al-newsadd', '✅ Haber yayınlandı!', 'ok');
    ['news-title', 'news-content', 'news-tag'].forEach(id => document.getElementById(id).value = '');
  } catch (e) {
    showAlert('al-newsadd', '❌ Hata: ' + e.message, 'err');
  }
}

// ════════════════════════════════════════════════════════
// QUIZ & ANALİZ
// ════════════════════════════════════════════════════════
function buildTopicCheckboxes() {
  const wrap = document.getElementById('topic-checkboxes');
  if (!wrap) return;
  const topics = [...new Set(questions.map(q => q.topic))];
  wrap.innerHTML = topics.map(k => `
    <label class="qo-check"><input type="checkbox" class="topic-check" value="${esc(k)}" checked> ${esc(TOPIC_NAMES[k] || k)}</label>`).join('');
}

function startQuiz() {
  const selTopics = [...document.querySelectorAll('.topic-check:checked')].map(c => c.value);
  const selDiffs = [...document.querySelectorAll('.diff-check:checked')].map(c => c.value);
  const selTypes = [...document.querySelectorAll('.type-check:checked')].map(c => c.value);
  const countVal = document.getElementById('q-count').value;
  const alertEl = document.getElementById('quiz-start-alert');

  if (!selTopics.length) { alertEl.textContent = 'En az bir konu seçmelisin!'; return; }
  if (!selDiffs.length) { alertEl.textContent = 'En az bir zorluk seviyesi seçmelisin!'; return; }
  if (!selTypes.length) { alertEl.textContent = 'En az bir soru tipi seçmelisin!'; return; }
  alertEl.textContent = '';

  let pool = questions.filter(q => selTopics.includes(q.topic) && selDiffs.includes(q.difficulty) && selTypes.includes(q.type || 'mc'));
  if (!pool.length) { alertEl.textContent = 'Seçilen kriterlere uygun soru bulunamadı!'; return; }

  pool = pool.sort(() => Math.random() - 0.5);
  if (countVal !== 'all') pool = pool.slice(0, parseInt(countVal));

  activeQuestions = pool;
  currentQ = 0;
  score = 0;
  answered = [];
  quizScoreAdded = false;

  document.getElementById('quiz-start').style.display = 'none';
  document.getElementById('quiz-active').style.display = 'block';
  document.getElementById('quiz-done').style.display = 'none';
  document.getElementById('qz-tot').textContent = activeQuestions.length;
  renderQ();
}

function backToStart() {
  document.getElementById('quiz-start').style.display = 'block';
  document.getElementById('quiz-active').style.display = 'none';
}

async function finishQuiz() {
  document.getElementById('qz-container').style.display = 'none';
  document.getElementById('quiz-done').style.display = 'block';
  document.getElementById('qz-final').textContent = score;
  if (!quizScoreAdded) {
    totalScore += score;
    quizScoreAdded = true;
    updateHomeStats();
    await saveUserProgressToFirestore();
  }
}

function renderQ() {
  const con = document.getElementById('qz-container');
  if (currentQ >= activeQuestions.length) {
    finishQuiz();
    return;
  }
  con.style.display = 'block';
  const q = activeQuestions[currentQ];
  const ans = answered[currentQ];
  const done = ans !== undefined;
  const pct = Math.round((currentQ / activeQuestions.length) * 100);
  document.getElementById('qz-idx').textContent = currentQ + 1;
  document.getElementById('qz-pct').textContent = pct + '%';
  document.getElementById('qz-fill').style.width = pct + '%';
  document.getElementById('qz-score').textContent = score;

  const isTF = (q.type === 'tf');
  let optsHtml = isTF ? `<div class="opts tf-opts">
    <button class="opt ${done ? ((q.tfCorrect ? 1 : 0) === 1 ? 'correct' : (ans === 1 ? 'wrong' : '')) : ''}" onclick="answerQ(1)" ${done ? 'disabled' : ''}>✅ Doğru</button>
    <button class="opt ${done ? ((q.tfCorrect ? 1 : 0) === 0 ? 'correct' : (ans === 0 ? 'wrong' : '')) : ''}" onclick="answerQ(0)" ${done ? 'disabled' : ''}>❌ Yanlış</button>
  </div>` :
    `<div class="opts">${q.options.map((o, i) => `
    <button class="opt ${done ? (i === q.correct ? 'correct' : (i === ans ? 'wrong' : '')) : ''}" onclick="answerQ(${i})" ${done ? 'disabled' : ''}>
      <span style="color:var(--accent);font-weight:800;margin-right:5px">${'ABCD'[i]})</span>${esc(o)}
    </button>`).join('')}</div>`;

  con.innerHTML = `
    <div class="q-card">
      <div class="q-meta">
        <span class="badge badge-t">${esc(TOPIC_NAMES[q.topic] || q.topic)}</span>
        <span class="badge badge-d">${esc(q.difficulty)}</span>
        <span class="badge badge-type">${isTF ? 'D/Y' : 'Çoktan Seçmeli'}</span>
      </div>
      <div class="q-text">${currentQ + 1}. ${esc(q.text)}</div>
      ${optsHtml}
      <div class="expl ${done ? 'show' : ''}">💡 ${esc(q.explanation)}</div>
    </div>
    <div class="q-actions">
      ${currentQ > 0 ? `<button class="btn btn-outline btn-sm" onclick="prevQ()">← Önceki</button>` : ''}
      ${done ? `<button class="btn btn-green btn-sm" onclick="nextQ()">Sonraki →</button>` : ''}
    </div>`;
}

function answerQ(i) {
  if (answered[currentQ] !== undefined) return;
  const q = activeQuestions[currentQ];
  answered[currentQ] = i;
  if (!quizResults[q.topic]) quizResults[q.topic] = { correct: 0, wrong: 0 };
  const correct = (q.type === 'tf') ? (i === (q.tfCorrect ? 1 : 0)) : (i === q.correct);
  if (correct) { score += 10; quizResults[q.topic].correct++; }
  else quizResults[q.topic].wrong++;
  renderQ();
}

function nextQ() {
  if (currentQ < activeQuestions.length - 1) {
    currentQ++;
    renderQ();
  } else {
    finishQuiz();
  }
}

function prevQ() { if (currentQ > 0) { currentQ--; renderQ(); } }

function renderAnalysis() {
  let tc = 0, tw = 0;
  Object.values(quizResults).forEach(r => { tc += r.correct; tw += r.wrong; });
  const tot = tc + tw, rate = tot > 0 ? Math.round(tc / tot * 100) : 0;
  document.getElementById('an-stats').innerHTML = `
    <div class="an-card"><div class="an-num" style="color:var(--accent)">${tot}</div><div class="an-lbl">Çözülen Soru</div></div>
    <div class="an-card"><div class="an-num" style="color:var(--green)">${tc}</div><div class="an-lbl">Doğru</div></div>
    <div class="an-card"><div class="an-num" style="color:var(--red)">${tw}</div><div class="an-lbl">Yanlış</div></div>
    <div class="an-card"><div class="an-num" style="color:${rate >= 70 ? 'var(--green)' : rate >= 40 ? 'var(--accent)' : 'var(--red)'}">${rate}%</div><div class="an-lbl">Başarı Oranı</div></div>`;

  const allT = { ...Object.fromEntries([...new Set(questions.map(q => q.topic))].map(k => [k, TOPIC_NAMES[k] || k])) };
  let bars = '<div class="items-list"><h3>Konulara Göre Başarı</h3>';
  Object.entries(allT).forEach(([k, v]) => {
    const r = quizResults[k] || { correct: 0, wrong: 0 };
    const t = r.correct + r.wrong;
    const p = t > 0 ? Math.round(r.correct / t * 100) : null;
    const cls = p === null ? '' : p >= 70 ? 'fill-strong' : p >= 40 ? 'fill-medium' : 'fill-weak';
    bars += `<div class="topic-bar-wrap"><div class="tbw-label"><span>${esc(v)}</span><span>${p !== null ? p + '%' : 'Çözülmedi'}</span></div><div class="tbw-bar"><div class="tbw-fill ${cls}" style="width:${p || 0}%"></div></div></div>`;
  });
  bars += '</div>';

  let sugs = '<div class="items-list"><h3>💡 Öneriler</h3>';
  let hasSug = false;
  Object.entries(allT).forEach(([k, v]) => {
    const r = quizResults[k] || { correct: 0, wrong: 0 };
    const t = r.correct + r.wrong;
    const p = t > 0 ? Math.round(r.correct / t * 100) : null;
    if (p !== null && p < 60) {
      hasSug = true;
      sugs += `<div class="sug-item"><div class="sug-icon">⚠️</div><div><div class="sug-title">${esc(v)} konusunu tekrar et</div><div class="sug-text">Başarı oranın %${p}. Konu anlatımı bölümünü incele.</div></div></div>`;
    }
  });
  if (!hasSug && tot === 0) sugs += '<div class="sug-item"><div class="sug-icon">👋</div><div><div class="sug-title">Henüz quiz çözmedin</div><div class="sug-text">Quiz bölümünden soru çöz!</div></div></div>';
  else if (!hasSug) sugs += '<div class="sug-item"><div class="sug-icon">🎉</div><div><div class="sug-title">Tüm konularda başarılısın!</div><div class="sug-text">Harika iş çıkardın!</div></div></div>';
  sugs += '</div>';
  document.getElementById('an-details').innerHTML = bars + sugs;
}

// ════════════════════════════════════════════════════════
// YÖNETİCİ PANELİ İŞLEMLERİ & TOPLU SORU YÜKLEME
// ════════════════════════════════════════════════════════
function showAdmPanel(id, btn) {
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.asb-btn').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById('adm-' + id);
  if (panel) panel.classList.add('active');
  if (btn) btn.classList.add('active');
  if (id === 'q-list') renderQList();
  if (id === 'c-list') renderCList();
  if (id === 'news-list') renderNewsList();
  if (id === 'block-list') renderBlockList();
  if (id === 'users') renderUsersList();
}

function buildAdminTopicSelects() {
  const topics = Object.keys(TOPIC_NAMES).filter(k => !['nokta', 'virgul', 'noktali-virgul', 'iki-nokta', 'uc-nokta', 'soru', 'unlem'].includes(k));
  const allTopics = Object.keys(TOPIC_NAMES);
  ['aq-topic', 'ac-topic'].forEach(sid => {
    const sel = document.getElementById(sid);
    if (!sel) return;
    const opts = (sid === 'ac-topic' ? allTopics : topics);
    sel.innerHTML = opts.map(k => `<option value="${esc(k)}">${esc(TOPIC_NAMES[k] || k)}</option>`).join('');
  });
}

function toggleQType() {
  const t = document.getElementById('aq-type').value;
  document.getElementById('mc-opts').style.display = t === 'mc' ? 'block' : 'none';
  document.getElementById('tf-opts').style.display = t === 'tf' ? 'block' : 'none';
}

async function addQuestion() {
  if (!isAdmin) return;
  const text = document.getElementById('aq-text').value.trim();
  const qtype = document.getElementById('aq-type').value;
  if (!text) { showAlert('al-qadd', '❌ Soru metni zorunludur!', 'err'); return; }

  let q = {
    topic: document.getElementById('aq-topic').value,
    difficulty: document.getElementById('aq-diff').value,
    type: qtype,
    text,
    explanation: document.getElementById('aq-expl').value.trim() || 'Açıklama eklenmemiş.',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  if (qtype === 'mc') {
    const opts = [document.getElementById('oa').value.trim(), document.getElementById('ob').value.trim(), document.getElementById('oc').value.trim(), document.getElementById('od').value.trim()];
    const cr = document.querySelector('input[name="cr"]:checked');
    if (opts.some(o => !o) || !cr) { showAlert('al-qadd', '❌ Tüm seçenekleri ve doğru cevabı seçin!', 'err'); return; }
    q.options = opts;
    q.correct = parseInt(cr.value);
    cr.checked = false;
    ['oa', 'ob', 'oc', 'od'].forEach(id => document.getElementById(id).value = '');
  } else {
    const tfAns = document.querySelector('input[name="tf-ans"]:checked');
    if (!tfAns) { showAlert('al-qadd', '❌ Doğru/Yanlış cevabı seçin!', 'err'); return; }
    q.tfCorrect = tfAns.value === '1';
    tfAns.checked = false;
  }

  try {
    const ref = await db.collection('questions').add(q);
    questions.push({ id: ref.id, ...q });
    updateHomeStats();
    buildTopicCheckboxes();
    showAlert('al-qadd', '✅ Soru buluta eklendi!', 'ok');
    document.getElementById('aq-text').value = '';
    document.getElementById('aq-expl').value = '';
  } catch (e) {
    showAlert('al-qadd', '❌ Hata: ' + e.message, 'err');
  }
}

// TOPLU SORU YÜKLEME FONKSİYONLARI
function loadBulkFile(inp) {
  const file = inp.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('bulk-json-text').value = e.target.result;
  };
  reader.readAsText(file);
}

async function uploadBulkQuestions() {
  if (!isAdmin) return;
  const raw = document.getElementById('bulk-json-text').value.trim();
  if (!raw) { showAlert('al-qbulk', '❌ Lütfen JSON verisi girin veya dosya seçin!', 'err'); return; }

  let parsed;
  try {
    parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Veri bir JSON dizisi ([...]) olmalıdır.');
  } catch (e) {
    showAlert('al-qbulk', '❌ Geçersiz JSON formatı: ' + e.message, 'err');
    return;
  }

  showAlert('al-qbulk', `⏳ ${parsed.length} soru yükleniyor, lütfen bekleyin...`, 'ok');

  let addedCount = 0;
  const batch = db.batch();

  parsed.forEach(item => {
    if (!item.text || !item.topic) return;
    const docRef = db.collection('questions').doc();
    const qObj = {
      topic: item.topic,
      difficulty: item.difficulty || 'Orta',
      type: item.type || 'mc',
      text: item.text,
      explanation: item.explanation || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (qObj.type === 'tf') {
      qObj.tfCorrect = Boolean(item.tfCorrect);
    } else {
      qObj.options = item.options || ['', '', '', ''];
      qObj.correct = Number(item.correct) || 0;
    }
    batch.set(docRef, qObj);
    questions.push({ id: docRef.id, ...qObj });
    addedCount++;
  });

  try {
    await batch.commit();
    updateHomeStats();
    buildTopicCheckboxes();
    document.getElementById('bulk-json-text').value = '';
    document.getElementById('bulk-file').value = '';
    showAlert('al-qbulk', `✅ Toplam ${addedCount} soru başarıyla eklendi!`, 'ok');
  } catch (e) {
    showAlert('al-qbulk', '❌ Toplu yükleme hatası: ' + e.message, 'err');
  }
}

function renderQList() {
  const w = document.getElementById('q-list-wrap');
  const badge = document.getElementById('q-total-badge');
  if (badge) badge.textContent = questions.length;
  if (!w) return;
  if (!questions.length) { w.innerHTML = '<p style="color:var(--muted)">Henüz soru yok.</p>'; return; }
  w.innerHTML = questions.map(q => `
    <div class="li-item">
      <div class="li-item-text">
        <div class="li-top">${esc(TOPIC_NAMES[q.topic] || q.topic)} · ${esc(q.difficulty)} · ${q.type === 'tf' ? 'D/Y' : 'Çoktan Seçmeli'}</div>
        <div class="li-main">${esc(q.text.substring(0, 75))}${q.text.length > 75 ? '…' : ''}</div>
      </div>
      <div class="li-actions">
        ${!q.id.startsWith('q') ? `<button class="ic-btn del" onclick="delQ('${esc(q.id)}')">🗑️</button>` : '<span style="font-size:0.7rem;color:var(--muted)">Sabit</span>'}
      </div>
    </div>`).join('');
}

async function delQ(id) {
  if (!confirm('Bu soruyu silmek istiyor musunuz?')) return;
  try {
    await db.collection('questions').doc(id).delete();
    questions = questions.filter(q => q.id !== id);
    renderQList();
    updateHomeStats();
  } catch (e) {
    alert('Silinemedi: ' + e.message);
  }
}

function renderCList() {
  const w = document.getElementById('c-list-wrap');
  if (!w) return;
  w.innerHTML = cartoons.map(c => `
    <div class="li-item">
      <div class="li-item-text"><div class="li-top">${esc(TOPIC_NAMES[c.topic] || c.topic)}</div><div class="li-main">${esc(c.emoji)} ${esc(c.title)}</div></div>
      <div class="li-actions">
        ${!c.id.startsWith('c') ? `<button class="ic-btn del" onclick="delC('${esc(c.id)}')">🗑️</button>` : '<span style="font-size:0.7rem;color:var(--muted)">Sabit</span>'}
      </div>
    </div>`).join('');
}

async function delC(id) {
  if (!confirm('Bu karikatürü silmek istiyor musunuz?')) return;
  try {
    await db.collection('cartoons').doc(id).delete();
    cartoons = cartoons.filter(c => c.id !== id);
    renderCList();
    renderCartoons('all');
    updateHomeStats();
  } catch (e) {
    alert('Silinemedi: ' + e.message);
  }
}

async function saveBlock() {
  if (!isAdmin) return;
  const section = document.getElementById('block-section').value;
  const sub = document.getElementById('block-sub').value;
  const title = document.getElementById('block-title').value.trim();
  const content = document.getElementById('block-content').value.trim();
  if (!title || !content) { showAlert('al-blockadd', '❌ Başlık ve içerik zorunludur!', 'err'); return; }

  const bl = {
    section, sub, title, content,
    exGood: document.getElementById('block-good').value.trim(),
    exBad: document.getElementById('block-bad').value.trim(),
    emoji: document.getElementById('block-emoji').value.trim(),
    bubble: document.getElementById('block-bubble').value.trim(),
    note: document.getElementById('block-note').value.trim(),
    isDefault: false, isTable: false
  };

  try {
    const ref = await db.collection('blocks').add(bl);
    contentBlocks.push({ id: ref.id, ...bl });
    renderAll();
    cancelBlockEdit();
    showAlert('al-blockadd', '✅ İçerik bloğu eklendi!', 'ok');
  } catch (e) {
    showAlert('al-blockadd', '❌ Hata: ' + e.message, 'err');
  }
}

async function deleteBlock(id) {
  if (!confirm('Bu içerik bloğunu silmek istiyor musunuz?')) return;
  try {
    await db.collection('blocks').doc(id).delete();
    contentBlocks = contentBlocks.filter(b => b.id !== id);
    renderAll();
    renderBlockList();
  } catch (e) {
    alert('Silinemedi: ' + e.message);
  }
}

function cancelBlockEdit() {
  document.getElementById('block-edit-id').value = '';
  ['block-title', 'block-content', 'block-good', 'block-bad', 'block-emoji', 'block-bubble', 'block-note'].forEach(i => document.getElementById(i).value = '');
}

function renderBlockList() {
  const w = document.getElementById('block-list-wrap');
  if (!w) return;
  w.innerHTML = contentBlocks.map(bl => `
    <div class="li-item">
      <div class="li-item-text">
        <div class="li-top">${esc(bl.section)} › ${esc(bl.sub)}</div>
        <div class="li-main">${esc(bl.title.substring(0, 70))}</div>
      </div>
      <div class="li-actions">
        ${!bl.isDefault ? `<button class="ic-btn del" onclick="deleteBlock('${esc(bl.id)}')">🗑️</button>` : '<span style="font-size:0.7rem;color:var(--muted)">Sabit</span>'}
      </div>
    </div>`).join('');
}

function renderNewsList() {
  const w = document.getElementById('news-list-wrap');
  if (!w) return;
  if (!newsItems.length) { w.innerHTML = '<p style="color:var(--muted)">Henüz haber yok.</p>'; return; }
  w.innerHTML = newsItems.map(n => `
    <div class="li-item">
      <div class="li-item-text"><div class="li-top">${esc(n.tag || 'Haber')} · ${esc(n.date || '')}</div><div class="li-main">${esc(n.title.substring(0, 70))}</div></div>
      <div class="li-actions"><button class="ic-btn del" onclick="delNews('${esc(n.id)}')">🗑️</button></div>
    </div>`).join('');
}

async function delNews(id) {
  if (!confirm('Bu haberi silmek istiyor musunuz?')) return;
  try {
    await db.collection('news').doc(id).delete();
    newsItems = newsItems.filter(n => n.id !== id);
    renderNews();
    renderNewsList();
  } catch (e) {
    alert('Silinemedi: ' + e.message);
  }
}

async function renderUsersList() {
  const w = document.getElementById('users-list-wrap');
  if (!w) return;
  w.innerHTML = '<p style="color:var(--muted)">Kullanıcılar yükleniyor...</p>';
  try {
    const snap = await db.collection('users').orderBy('totalScore', 'desc').get();
    if (snap.empty) { w.innerHTML = '<p style="color:var(--muted)">Henüz kullanıcı yok.</p>'; return; }
    w.innerHTML = snap.docs.map(doc => {
      const u = doc.data();
      return `
      <div class="li-item">
        <div class="li-item-text">
          <div class="li-top">${esc(u.email)} · ⭐ ${u.totalScore || 0} puan</div>
          <div class="li-main">👤 ${esc(u.fullname)}</div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    w.innerHTML = '<p style="color:var(--red)">Kullanıcı listesi alınamadı.</p>';
  }
}

function showAlert(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'al ' + (type === 'ok' ? 'ok' : 'err');
  el.textContent = msg;
  setTimeout(() => el.className = 'al', 4000);
}