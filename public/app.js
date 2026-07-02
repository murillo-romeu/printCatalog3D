/* ==========================================================================
   PrintCatalog 3D - Lógica Frontend (app.js)
   Gerenciamento de Estado, Integração com API e Visualizador 3D (Three.js)
   ========================================================================== */

// --- Estado Global do Frontend ---
let state = {
  models: [],
  allCategories: [],
  allTags: [],
  totalCount: 0,
  currentPage: 1,
  totalPages: 1,
  limit: 24,
  
  // Filtros ativos
  searchQuery: '',
  activeCategory: null,
  activeTag: null,
  quickFilter: 'all', // 'all', 'favs', 'images', 'archives'
  sortOption: 'default',
  
  // Modal de Detalhes
  selectedModel: null,
  currentImageIndex: 0,
  activeVisualTab: 'images', // 'images', '3d'
  
  // Controle de Varredura
  isScanning: false
};

// --- Estado do Visualizador Three.js ---
let threeState = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  currentMesh: null,
  animationFrameId: null,
  isInitialized: false
};

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
  // Configurar campo de busca com delay (debounce)
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  let searchTimeout = null;
  
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    
    if (state.searchQuery) {
      searchClear.style.display = 'block';
    } else {
      searchClear.style.display = 'none';
    }
    
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.currentPage = 1;
      fetchModels();
    }, 4000); // 400ms debounce
  });

  // Evento para limpar busca
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    state.searchQuery = '';
    searchClear.style.display = 'none';
    state.currentPage = 1;
    fetchModels();
  });

  // Fechar modal ao pressionar ESC ou clicar fora
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
  const modal = document.getElementById('model-modal');
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Toggle do colapso de categorias
  const toggleCatsBtn = document.getElementById('toggle-cats');
  const catListEl = document.getElementById('category-list');
  toggleCatsBtn.addEventListener('click', () => {
    catListEl.style.display = catListEl.style.display === 'none' ? 'flex' : 'none';
    toggleCatsBtn.classList.toggle('collapsed');
  });

  // Carregar dados iniciais
  fetchModels();
});

// --- Requisições de API ---

// Buscar Modelos (com paginação e filtros)
async function fetchModels(page = 1) {
  state.currentPage = page;
  
  // Construir parâmetros da URL
  const params = new URLSearchParams({
    page: state.currentPage,
    limit: state.limit,
    sort: state.sortOption
  });

  if (state.searchQuery) params.append('search', state.searchQuery);
  if (state.activeCategory) params.append('category', state.activeCategory);
  if (state.activeTag) params.append('tag', state.activeTag);

  if (state.quickFilter === 'favs') params.append('favorite', 'true');
  if (state.quickFilter === 'images') params.append('hasImages', 'true');
  if (state.quickFilter === 'archives') params.append('isArchive', 'true');

  renderLoading();

  try {
    const response = await fetch(`/api/models?${params.toString()}`);
    const data = await response.json();

    state.models = data.models;
    state.totalCount = data.totalCount;
    state.totalPages = data.totalPages;
    state.allCategories = data.allCategories;
    state.allTags = data.allTags;
    state.categoryCounts = data.categoryCounts || {};
    state.tagCounts = data.tagCounts || {};
    
    // Atualizar tempo da última varredura
    updateScanTimeDisplay(data.lastScan);

    renderGrid();
    renderCategories();
    renderTags();
    renderPagination();
  } catch (err) {
    console.error('Erro ao buscar modelos:', err);
    showGridMessage('error', 'Erro ao carregar a biblioteca de modelos.');
  }
}

// Alterar Filtro Rápido (Todos, Favoritos, Com Imagens, Compactados)
function setQuickFilter(type) {
  state.quickFilter = type;
  
  // Atualizar estilo ativo nos botões
  const chips = document.querySelectorAll('.quick-filters .filter-chip');
  chips.forEach(chip => chip.classList.remove('active'));
  
  if (type === 'all') document.getElementById('filter-all').classList.add('active');
  if (type === 'favs') document.getElementById('filter-favs').classList.add('active');
  if (type === 'images') document.getElementById('filter-images').classList.add('active');
  if (type === 'archives') document.getElementById('filter-archives').classList.add('active');

  // Resetar categoria/tag ativa se mudar de filtro geral
  state.activeCategory = null;
  state.activeTag = null;
  state.currentPage = 1;
  
  // Atualizar título do cabeçalho
  const titles = {
    all: 'Todos os Modelos',
    favs: 'Modelos Favoritos',
    images: 'Modelos com Imagem',
    archives: 'Modelos Compactados (.rar/.zip)'
  };
  document.getElementById('current-filter-title').innerText = titles[type];

  fetchModels();
}

// Alterar Ordenação
function handleSortChange() {
  state.sortOption = document.getElementById('sort-select').value;
  state.currentPage = 1;
  fetchModels();
}

// Paginação
function changePage(direction) {
  const targetPage = state.currentPage + direction;
  if (targetPage >= 1 && targetPage <= state.totalPages) {
    fetchModels(targetPage);
  }
}

// Favoritar (Card ou Modal)
async function toggleFavorite(modelId, event = null) {
  if (event) event.stopPropagation(); // Evitar abrir modal se clicou na estrela do card

  try {
    const response = await fetch(`/api/models/${encodeURIComponent(modelId)}/favorite`, {
      method: 'POST'
    });
    const data = await response.json();
    
    if (data.success) {
      // Atualizar no estado local
      const model = state.models.find(m => m.id === modelId);
      if (model) model.favorite = data.favorite;

      if (state.selectedModel && state.selectedModel.id === modelId) {
        state.selectedModel.favorite = data.favorite;
        updateModalFavoriteButton(data.favorite);
      }

      // Se o filtro ativo for favoritos, e removemos um favorito, devemos recarregar
      if (state.quickFilter === 'favs' && !data.favorite) {
        fetchModels(state.currentPage);
      } else {
        // Apenas renderiza a grade para refletir a estrela
        renderGrid();
      }
    }
  } catch (err) {
    console.error('Erro ao favoritar:', err);
  }
}

// Tracionar varredura de arquivos
async function triggerScan() {
  if (state.isScanning) return;
  
  state.isScanning = true;
  const btn = document.getElementById('btn-scan');
  btn.innerHTML = `<span class="spinner" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;"></span> Varrendo...`;
  btn.disabled = true;
  
  renderGridMessage('info', 'Varrendo e catalogando arquivos 3D... Isso pode levar alguns segundos.');

  try {
    const response = await fetch('/api/scan', { method: 'POST' });
    const data = await response.json();
    if (data.success) {
      alert(`Varredura finalizada! Catalogados ${data.count} modelos de pastas.`);
      fetchModels(1);
    }
  } catch (err) {
    console.error('Erro na varredura:', err);
    alert('Erro ao atualizar a biblioteca.');
    fetchModels(state.currentPage);
  } finally {
    state.isScanning = false;
    btn.innerHTML = `<span class="material-symbols-rounded">sync</span> Atualizar Biblioteca`;
    btn.disabled = false;
  }
}

// Abrir Pasta no Windows Explorer
async function openFolderInExplorer() {
  if (!state.selectedModel) return;
  try {
    const response = await fetch(`/api/models/${encodeURIComponent(state.selectedModel.id)}/open`, {
      method: 'POST'
    });
    const data = await response.json();
    if (!data.success) {
      alert('Falha ao abrir a pasta no Explorer.');
    }
  } catch (err) {
    console.error(err);
    alert('Erro ao enviar comando de abertura.');
  }
}

// Salvar Metadados (Tags, Notas, Categoria Personalizada, Classificação)
async function saveMetadata() {
  if (!state.selectedModel) return;

  const tagsInput = document.getElementById('modal-tags').value;
  const tags = tagsInput.split(',').map(t => t.trim()).filter(t => t !== '');
  const notes = document.getElementById('modal-notes').value;
  const customCategory = document.getElementById('modal-custom-category').value.trim();

  const payload = {
    tags,
    notes,
    customCategory,
    rating: state.selectedModel.rating
  };

  try {
    const response = await fetch(`/api/models/${encodeURIComponent(state.selectedModel.id)}/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    if (data.success) {
      // Atualizar estado
      const index = state.models.findIndex(m => m.id === state.selectedModel.id);
      if (index !== -1) {
        state.models[index] = { ...state.models[index], ...payload };
      }
      state.selectedModel = { ...state.selectedModel, ...payload };
      
      // Não fecha o modal, atualiza a lista de fundo em segundo plano para refletir no Grid
      setTimeout(() => {
        // Recarregar os filtros da sidebar para refletir novas tags criadas
        fetchModels(state.currentPage);
      }, 800);
    }
  } catch (err) {
    console.error('Erro ao salvar metadados:', err);
  }
}

// Definir Classificação Estrelas
async function setRating(stars) {
  if (!state.selectedModel) return;
  state.selectedModel.rating = stars;
  updateModalRatingStars(stars);
  await saveMetadata();
}


// --- Funções de Renderização DOM ---

function renderLoading() {
  const grid = document.getElementById('model-grid');
  grid.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <p>Carregando modelos 3D...</p>
    </div>
  `;
}

function showGridMessage(type, title, message = '') {
  const grid = document.getElementById('model-grid');
  let icon = 'info';
  if (type === 'error') icon = 'error';
  if (type === 'empty') icon = 'folder_open';
  
  grid.innerHTML = `
    <div class="empty-state">
      <span class="material-symbols-rounded icon">${icon}</span>
      <h3>${title}</h3>
      <p>${message}</p>
    </div>
  `;
}

function renderGridMessage(type, text) {
  const grid = document.getElementById('model-grid');
  grid.innerHTML = `
    <div class="loading-container">
      <div class="spinner"></div>
      <p>${text}</p>
    </div>
  `;
}

// Renderizar Grade de Cards de Modelos
function renderGrid() {
  const grid = document.getElementById('model-grid');
  
  if (state.models.length === 0) {
    showGridMessage('empty', 'Nenhum modelo encontrado', 'Experimente alterar os filtros de busca ou clique em "Atualizar Biblioteca".');
    return;
  }

  grid.innerHTML = state.models.map(model => {
    // Configurações do Preview de Imagem
    const hasImage = model.images && model.images.length > 0;
    const thumbnailSrc = hasImage 
      ? `/api/files?path=${encodeURIComponent(model.images[0])}`
      : '';
      
    // Estilo de badges
    const stlCount = model.modelFiles.length;
    const archiveCount = model.archiveFiles.length;
    
    let badgeHtml = '';
    if (stlCount > 0) {
      badgeHtml = `<span class="card-badge badge-stl">${stlCount} Arquivo${stlCount > 1 ? 's' : ''} 3D</span>`;
    } else if (archiveCount > 0) {
      badgeHtml = `<span class="card-badge badge-archive">${archiveCount} Compactado${archiveCount > 1 ? 's' : ''}</span>`;
    }

    // Estrelas de rating
    let ratingStarsHtml = '';
    if (model.rating > 0) {
      ratingStarsHtml = `<div class="card-rating">` + 
        `<span class="material-symbols-rounded star-filled">star</span>`.repeat(model.rating) + 
        `</div>`;
    }

    // Breadcrumbs da categoria
    const breadcrumbs = model.customCategory 
      ? model.customCategory.split('/') 
      : model.categoryPath;
    const breadcrumbsText = breadcrumbs.slice(0, 3).join(' > ') || 'Principal';

    return `
      <div class="model-card" onclick="openModal('${model.id}')">
        <div class="card-thumbnail-wrapper">
          ${hasImage 
            ? `<img src="${thumbnailSrc}" alt="${model.name}" loading="lazy">` 
            : `<span class="material-symbols-rounded card-placeholder-icon">3d_rotation</span>`}
          ${badgeHtml}
          <button class="card-fav-btn ${model.favorite ? 'active' : ''}" onclick="toggleFavorite('${model.id}', event)">
            <span class="material-symbols-rounded">${model.favorite ? 'star' : 'star'}</span>
          </button>
        </div>
        <div class="card-info">
          <span class="card-breadcrumbs" title="${breadcrumbs.join(' > ')}">${breadcrumbsText}</span>
          <h3 class="card-title" title="${model.name}">${model.name}</h3>
          
          <div class="card-meta-row">
            <span class="card-file-count">
              <span class="material-symbols-rounded">folder</span>
              ${model.archiveFiles.length > 0 ? 'Compactado' : 'STL/3MF'}
            </span>
            ${ratingStarsHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Renderizar lista de categorias na sidebar
function renderCategories() {
  const list = document.getElementById('category-list');
  if (state.allCategories.length === 0) {
    list.innerHTML = `<p class="empty-text">Nenhuma categoria.</p>`;
    return;
  }

  const counts = state.categoryCounts || {};
  const totalCount = counts['_total'] || state.totalCount;

  list.innerHTML = `
    <div class="category-item ${state.activeCategory === null ? 'active' : ''}" onclick="filterCategory(null)">
      <span>Todas as Pastas</span>
      <span class="count">${totalCount}</span>
    </div>
    ${state.allCategories.map(cat => {
      const count = counts[cat] || 0;
      return `
        <div class="category-item ${state.activeCategory === cat ? 'active' : ''}" onclick="filterCategory('${cat}')" title="${cat}">
          <span>${cat}</span>
          <span class="count">${count}</span>
        </div>
      `;
    }).join('')}
  `;
}

// Filtrar por categoria
function filterCategory(cat) {
  state.activeCategory = cat;
  state.activeTag = null; // Resetar tag ao mudar categoria
  state.currentPage = 1;
  
  if (cat) {
    document.getElementById('current-filter-title').innerText = `Pasta: ${cat}`;
  } else {
    document.getElementById('current-filter-title').innerText = 'Todos os Modelos';
  }
  
  fetchModels();
}

// Renderizar tags na sidebar
function renderTags() {
  const container = document.getElementById('tags-cloud');
  if (state.allTags.length === 0) {
    container.innerHTML = `<p class="empty-text">Sem tags.</p>`;
    return;
  }

  container.innerHTML = state.allTags.map(tag => `
    <span class="tag-badge ${state.activeTag === tag ? 'active' : ''}" onclick="filterTag('${tag}')">
      ${tag}
    </span>
  `).join('');
}

// Filtrar por Tag
function filterTag(tag) {
  if (state.activeTag === tag) {
    state.activeTag = null; // Desmarcar se clicar novamente
  } else {
    state.activeTag = tag;
  }
  state.currentPage = 1;
  
  if (state.activeTag) {
    document.getElementById('current-filter-title').innerText = `Tag: #${tag}`;
  } else {
    document.getElementById('current-filter-title').innerText = 'Todos os Modelos';
  }
  
  fetchModels();
}

// Renderizar Controle de Paginação
function renderPagination() {
  const info = document.getElementById('pagination-info');
  info.innerText = `Página ${state.currentPage} de ${state.totalPages || 1}`;

  document.getElementById('prev-page-btn').disabled = state.currentPage === 1;
  document.getElementById('next-page-btn').disabled = state.currentPage >= state.totalPages;
}

// Atualizar tempo de última varredura no sidebar
function updateScanTimeDisplay(isoString) {
  const el = document.getElementById('last-scan-time');
  if (!isoString) {
    el.innerText = 'Nunca';
    return;
  }
  const date = new Date(isoString);
  el.innerText = date.toLocaleString('pt-BR');
}


// --- Modal de Detalhes e Visualizador ---

// Abrir Modal
function openModal(modelId) {
  const model = state.models.find(m => m.id === modelId);
  if (!model) return;

  state.selectedModel = model;
  state.currentImageIndex = 0;
  state.activeVisualTab = 'images';

  // Preencher textos do Modal
  document.getElementById('modal-model-name').innerText = model.name;
  document.getElementById('modal-model-path').innerText = model.relativePath;
  
  // Setar valores dos inputs
  document.getElementById('modal-tags').value = model.tags.join(', ');
  document.getElementById('modal-notes').value = model.notes || '';
  document.getElementById('modal-custom-category').value = model.customCategory || '';

  // Configurar Estrelas e Favorito
  updateModalFavoriteButton(model.favorite);
  updateModalRatingStars(model.rating);

  // Renderizar a Galeria de Imagens
  renderImageCarousel();

  // Preencher seletor de arquivos STL
  const stlSelect = document.getElementById('stl-select');
  const stlFiles = model.modelFiles.filter(f => f.toLowerCase().endsWith('.stl'));
  
  if (stlFiles.length > 0) {
    stlSelect.innerHTML = stlFiles.map(f => `<option value="${f}">${f}</option>`).join('');
    document.getElementById('tab-3d').style.display = 'flex';
  } else {
    stlSelect.innerHTML = '<option value="">Nenhum STL carregado</option>';
    document.getElementById('tab-3d').style.display = 'none'; // Esconder tab 3D se não houver STL
  }

  // Preencher Lista de Arquivos Físicos
  const filesList = document.getElementById('modal-files-list');
  const allFiles = [
    ...model.modelFiles.map(f => ({ name: f, type: 'model' })),
    ...model.archiveFiles.map(f => ({ name: f, type: 'archive' })),
    ...model.images.map(f => ({ name: f.split('/').pop(), type: 'image' }))
  ];

  filesList.innerHTML = allFiles.map(file => {
    let icon = 'insert_drive_file';
    let fileClass = '';
    let actionBtn = '';

    if (file.type === 'model') {
      const isStl = file.name.toLowerCase().endsWith('.stl');
      icon = isStl ? '3d_rotation' : 'model_training';
      fileClass = isStl ? 'stl' : '';
      if (isStl) {
        actionBtn = `<button class="btn-view-stl" onclick="viewStlFromFileList('${file.name}')">Visualizar 3D</button>`;
      }
    } else if (file.type === 'archive') {
      icon = 'archive';
      fileClass = 'archive';
    } else if (file.type === 'image') {
      icon = 'image';
    }

    return `
      <li class="file-item">
        <div class="file-name-col ${fileClass}">
          <span class="material-symbols-rounded icon">${icon}</span>
          <span class="name" title="${file.name}">${file.name}</span>
        </div>
        <div class="file-actions-col">
          ${actionBtn}
        </div>
      </li>
    `;
  }).join('');

  // Configurar aba de imagem ativa por padrão
  switchVisualTab('images');

  // Mostrar modal
  document.getElementById('model-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden'; // Travar scroll de fundo
}

// Fechar Modal
function closeModal() {
  document.getElementById('model-modal').style.display = 'none';
  document.body.style.overflow = 'auto'; // Destravar scroll de fundo
  state.selectedModel = null;
  
  // Limpar recursos do Three.js para evitar memory leaks!
  destroyThreeJS();
}

function updateModalFavoriteButton(isFav) {
  const icon = document.getElementById('modal-fav-icon');
  const btn = document.getElementById('btn-modal-fav');
  if (isFav) {
    icon.innerText = 'star';
    btn.classList.add('active');
  } else {
    icon.innerText = 'star';
    btn.classList.remove('active');
  }
}

function toggleModalFavorite() {
  if (!state.selectedModel) return;
  toggleFavorite(state.selectedModel.id);
}

function updateModalRatingStars(rating) {
  const stars = document.querySelectorAll('#modal-rating-stars .star');
  stars.forEach((star, index) => {
    if (index < rating) {
      star.classList.add('selected');
    } else {
      star.classList.remove('selected');
    }
  });
}

// --- Galeria de Imagens (Carousel) ---

function renderImageCarousel() {
  const model = state.selectedModel;
  const carouselContent = document.getElementById('viewport-images');
  const mainImage = document.getElementById('modal-main-image');
  const indicators = document.getElementById('carousel-indicators');

  const hasImages = model.images && model.images.length > 0;

  if (!hasImages) {
    mainImage.src = '';
    mainImage.style.display = 'none';
    document.getElementById('carousel-prev').style.display = 'none';
    document.getElementById('carousel-next').style.display = 'none';
    indicators.innerHTML = '';
    carouselContent.classList.add('no-images');
    return;
  }

  carouselContent.classList.remove('no-images');
  mainImage.style.display = 'block';
  mainImage.src = `/api/files?path=${encodeURIComponent(model.images[state.currentImageIndex])}`;

  // Mostrar botões se houver mais de uma imagem
  const showControls = model.images.length > 1;
  document.getElementById('carousel-prev').style.display = showControls ? 'flex' : 'none';
  document.getElementById('carousel-next').style.display = showControls ? 'flex' : 'none';

  // Renderizar indicadores (bolinhas)
  if (showControls) {
    indicators.innerHTML = model.images.map((_, idx) => `
      <span class="indicator-dot ${idx === state.currentImageIndex ? 'active' : ''}" onclick="setCarouselIndex(${idx})"></span>
    `).join('');
  } else {
    indicators.innerHTML = '';
  }
}

function carouselSlide(direction) {
  const model = state.selectedModel;
  if (!model || !model.images || model.images.length <= 1) return;

  state.currentImageIndex += direction;

  // Lógica circular
  if (state.currentImageIndex < 0) {
    state.currentImageIndex = model.images.length - 1;
  } else if (state.currentImageIndex >= model.images.length) {
    state.currentImageIndex = 0;
  }

  renderImageCarousel();
}

function setCarouselIndex(index) {
  state.currentImageIndex = index;
  renderImageCarousel();
}


// --- Alternar Abas (Imagem x Visualizador 3D) ---

function switchVisualTab(tab) {
  state.activeVisualTab = tab;
  
  // Alterar classes ativas nos botões
  document.getElementById('tab-images').classList.toggle('active', tab === 'images');
  document.getElementById('tab-3d').classList.toggle('active', tab === '3d');

  // Alternar exibições
  document.getElementById('viewport-images').style.display = tab === 'images' ? 'flex' : 'none';
  document.getElementById('viewport-3d').style.display = tab === '3d' ? 'flex' : 'none';

  if (tab === '3d') {
    // Inicializar Three.js se necessário e carregar o primeiro STL
    setTimeout(() => {
      if (!threeState.isInitialized) {
        initThreeJS();
      } else {
        // Redimensionar para encaixar no canvas do modal aberto
        onWindowResize();
      }
      loadSTLInViewer();
    }, 100);
  } else {
    // Parar animações e liberar recursos de renderização quando sair da aba 3D
    // Para economizar desempenho da GPU
    stopThreeAnimation();
  }
}

// Atalho da lista de arquivos para abrir o visualizador 3D
function viewStlFromFileList(fileName) {
  const stlSelect = document.getElementById('stl-select');
  stlSelect.value = fileName;
  switchVisualTab('3d');
}


// --- Lógica Three.js (Visualizador 3D) ---

function initThreeJS() {
  const canvas = document.getElementById('threejs-canvas');
  const container = canvas.parentElement;
  
  const width = container.clientWidth || 550;
  const height = container.clientHeight || 350;

  // 1. Criar Cena
  threeState.scene = new THREE.Scene();
  threeState.scene.background = new THREE.Color(0x0a0f1d);

  // Adicionar Grid auxiliar de chão
  const gridHelper = new THREE.GridHelper(200, 50, 0x1e293b, 0x0f172a);
  gridHelper.position.y = -0.5; // Levemente abaixo do modelo centralizado
  threeState.scene.add(gridHelper);

  // 2. Criar Câmera
  threeState.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  threeState.camera.position.set(100, 100, 100);

  // 3. Criar Renderizador
  threeState.renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  threeState.renderer.setSize(width, height);
  threeState.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limitar a 2x para melhor performance
  threeState.renderer.shadowMap.enabled = true;

  // 4. OrbitControls para rotação, zoom e translação
  threeState.controls = new THREE.OrbitControls(threeState.camera, threeState.renderer.domElement);
  threeState.controls.enableDamping = true;
  threeState.controls.dampingFactor = 0.05;
  threeState.controls.maxDistance = 500;
  threeState.controls.minDistance = 10;

  // 5. Adicionar Iluminação Tridimensional
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  threeState.scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
  keyLight.position.set(100, 150, 50);
  threeState.scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x0ea5e9, 0.5); // Luz azulada de preenchimento
  fillLight.position.set(-100, 50, -50);
  threeState.scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.3); // Luz traseira para destacar bordas
  rimLight.position.set(0, -100, 0);
  threeState.scene.add(rimLight);

  // Ouvir redimensionamento da janela
  window.addEventListener('resize', onWindowResize);

  threeState.isInitialized = true;
  startThreeAnimation();
}

function startThreeAnimation() {
  if (threeState.animationFrameId) return;

  function animate() {
    threeState.animationFrameId = requestAnimationFrame(animate);
    
    if (threeState.controls) {
      threeState.controls.update();
    }
    
    if (threeState.renderer && threeState.scene && threeState.camera) {
      threeState.renderer.render(threeState.scene, threeState.camera);
    }
  }
  
  animate();
}

function stopThreeAnimation() {
  if (threeState.animationFrameId) {
    cancelAnimationFrame(threeState.animationFrameId);
    threeState.animationFrameId = null;
  }
}

// Redimensionar visualizador 3D se a janela mudar
function onWindowResize() {
  if (!threeState.isInitialized) return;

  const canvas = document.getElementById('threejs-canvas');
  const container = canvas.parentElement;
  const width = container.clientWidth;
  const height = container.clientHeight;

  threeState.camera.aspect = width / height;
  threeState.camera.updateProjectionMatrix();
  threeState.renderer.setSize(width, height);
}

// Carregar Malha STL no visualizador
function loadSTLInViewer() {
  if (!threeState.isInitialized || !state.selectedModel) return;

  const stlFileName = document.getElementById('stl-select').value;
  if (!stlFileName) return;

  // Mostrar spinner de carregamento
  const loaderEl = document.getElementById('viewer-loader');
  loaderEl.style.display = 'flex';

  // Remover malha antiga se houver
  if (threeState.currentMesh) {
    threeState.scene.remove(threeState.currentMesh);
    threeState.currentMesh.geometry.dispose();
    threeState.currentMesh.material.dispose();
    threeState.currentMesh = null;
  }

  // Caminho completo do arquivo no servidor
  const filePath = `${state.selectedModel.relativePath}/${stlFileName}`;
  const fileUrl = `/api/files?path=${encodeURIComponent(filePath)}`;

  const loader = new THREE.STLLoader();

  loader.load(fileUrl, (geometry) => {
    // 1. Recalcular normais das faces e centralizar o modelo no ponto (0, 0, 0)
    geometry.computeVertexNormals();
    geometry.center();

    // 2. Criar material fosco e suave (Shading bonito com azul ciano da paleta)
    const material = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,       // Azul Sky
      roughness: 0.4,
      metalness: 0.15,
      flatShading: true     // Realça as facetas geométricas das STL
    });

    threeState.currentMesh = new THREE.Mesh(geometry, material);
    threeState.scene.add(threeState.currentMesh);

    // 3. Ajustar Câmera automaticamente baseado na esfera delimitadora da geometria
    geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere;
    const radius = sphere.radius || 30;

    // Resetar o foco do controle orbital para o centro geométrico (0,0,0)
    threeState.controls.target.set(0, 0, 0);

    // Ajustar a distância da câmera proporcionalmente ao tamanho do STL
    const fovRad = threeState.camera.fov * (Math.PI / 180);
    let cameraDistance = Math.abs(radius / Math.sin(fovRad / 2));
    cameraDistance *= 1.4; // Multiplicador para margem de enquadramento

    threeState.camera.position.set(cameraDistance, cameraDistance, cameraDistance);
    threeState.camera.lookAt(new THREE.Vector3(0, 0, 0));
    
    // Atualizar controles
    threeState.controls.update();

    // Esconder spinner
    loaderEl.style.display = 'none';
  }, (xhr) => {
    // Progresso do carregamento (pode ser logado se necessário)
  }, (err) => {
    console.error('Erro ao carregar STL:', err);
    loaderEl.style.display = 'none';
    alert('Não foi possível renderizar a visualização 3D deste arquivo STL.');
  });
}

// Destruir recursos do ThreeJS ao fechar modal
function destroyThreeJS() {
  stopThreeAnimation();
  window.removeEventListener('resize', onWindowResize);

  if (threeState.currentMesh) {
    if (threeState.scene) threeState.scene.remove(threeState.currentMesh);
    threeState.currentMesh.geometry.dispose();
    threeState.currentMesh.material.dispose();
    threeState.currentMesh = null;
  }

  // Deletar o helper do grid
  if (threeState.scene) {
    // Dispose de todos os filhos
    while(threeState.scene.children.length > 0){ 
      threeState.scene.remove(threeState.scene.children[0]); 
    }
  }

  if (threeState.renderer) {
    threeState.renderer.dispose();
    threeState.renderer = null;
  }

  threeState.scene = null;
  threeState.camera = null;
  threeState.controls = null;
  threeState.isInitialized = false;
}
