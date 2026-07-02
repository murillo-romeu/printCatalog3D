const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const { existsSync } = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// O diretório raiz é a pasta pai deste app (e:\Modelos3d)
const ROOT_DIR = path.resolve(__dirname, '..');
const DB_FILE = path.join(__dirname, 'catalog_db.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar banco de dados JSON
async function loadDB() {
  if (!existsSync(DB_FILE)) {
    return { models: [], lastScan: null };
  }
  try {
    const data = await fs.readFile(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Erro ao ler banco de dados, resetando...', err);
    return { models: [], lastScan: null };
  }
}

async function saveDB(db) {
  try {
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('Erro ao salvar banco de dados:', err);
  }
}

// Lista de nomes de pastas genéricas para melhorar a nomenclatura
const GENERIC_FOLDER_NAMES = [
  'stl', 'stl files', 'stls', 'files', 'arquivos', 'modelo', '3d', 
  'render', 'images', 'imagens', 'obras', 'rar', 'zip', 'compress', 
  'pasta', 'downloads', 'parts', 'partes', 'pecas', 'mesh'
];

// Scanner recursivo de arquivos
async function scanDirectory(dir, dbModelsMap) {
  const list = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    console.error(`Erro ao ler pasta: ${dir}`, err);
    return list;
  }

  let localModels = [];
  let localImages = [];
  let localArchives = [];
  let hasSubdirs = false;

  const modelExts = ['.stl', '.3mf', '.obj', '.step', '.stp'];
  const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.jfif'];
  const archiveExts = ['.rar', '.zip', '.7z', '.tar', '.gz'];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Ignorar pastas ocultas ou do sistema
      if (entry.name.startsWith('.') || 
          entry.name === 'node_modules' || 
          entry.name === '_catalog_app' || 
          entry.name === '$RECYCLE.BIN' || 
          entry.name === 'System Volume Information') {
        continue;
      }
      hasSubdirs = true;
      const subList = await scanDirectory(fullPath, dbModelsMap);
      list.push(...subList);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (modelExts.includes(ext)) {
        localModels.push(entry.name);
      } else if (imageExts.includes(ext)) {
        localImages.push(entry.name);
      } else if (archiveExts.includes(ext)) {
        localArchives.push(entry.name);
      }
    }
  }

  // Se a pasta contém modelos 3D ou arquivos compactados, criamos um item no catálogo
  if (localModels.length > 0 || localArchives.length > 0) {
    const relDirPath = path.relative(ROOT_DIR, dir).replace(/\\/g, '/');
    const existing = dbModelsMap.get(relDirPath) || {};

    // Coletar imagens. Se não houver imagens diretamente, procura no diretório pai
    let imagesToUse = localImages.map(img => `${relDirPath}/${img}`);
    
    if (imagesToUse.length === 0) {
      // Busca no diretório pai direto
      let parentDir = path.dirname(dir);
      if (parentDir.startsWith(ROOT_DIR)) {
        try {
          const parentEntries = await fs.readdir(parentDir, { withFileTypes: true });
          const relParentPath = path.relative(ROOT_DIR, parentDir).replace(/\\/g, '/');
          const parentImages = parentEntries
            .filter(e => e.isFile() && imageExts.includes(path.extname(e.name).toLowerCase()))
            .map(e => `${relParentPath}/${e.name}`);
          imagesToUse.push(...parentImages);
        } catch (e) {}
      }
      
      // Se ainda estiver vazio, busca no avô (grandparent)
      if (imagesToUse.length === 0) {
        let grandparentDir = path.dirname(path.dirname(dir));
        if (grandparentDir.startsWith(ROOT_DIR)) {
          try {
            const gpEntries = await fs.readdir(grandparentDir, { withFileTypes: true });
            const relGpPath = path.relative(ROOT_DIR, grandparentDir).replace(/\\/g, '/');
            const gpImages = gpEntries
              .filter(e => e.isFile() && imageExts.includes(path.extname(e.name).toLowerCase()))
              .map(e => `${relGpPath}/${e.name}`);
            imagesToUse.push(...gpImages);
          } catch (e) {}
        }
      }
    }

    imagesToUse = [...new Set(imagesToUse)];

    // Montar o caminho da categoria com base nas pastas pai
    const categoryPath = relDirPath.split('/').filter(Boolean);
    let folderName = categoryPath.pop() || 'Principal';

    // Se o nome da pasta for genérico (ex: "STL"), combinamos com a pasta pai para fazer sentido
    if (GENERIC_FOLDER_NAMES.includes(folderName.toLowerCase()) && categoryPath.length > 0) {
      const parentFolderName = categoryPath[categoryPath.length - 1];
      folderName = `${parentFolderName} (${folderName})`;
    }

    list.push({
      id: relDirPath,
      name: folderName,
      relativePath: relDirPath,
      categoryPath: categoryPath,
      modelFiles: localModels,
      archiveFiles: localArchives,
      images: imagesToUse,
      favorite: existing.favorite || false,
      tags: existing.tags || [],
      notes: existing.notes || '',
      customCategory: existing.customCategory || '',
      rating: existing.rating || 0,
      addedAt: existing.addedAt || new Date().toISOString()
    });
  }

  return list;
}

// ROTA: Varredura completa
app.post('/api/scan', async (req, res) => {
  try {
    const db = await loadDB();
    const dbModelsMap = new Map(db.models.map(m => [m.id, m]));
    
    console.log('Iniciando varredura recursiva em:', ROOT_DIR);
    const scannedModels = await scanDirectory(ROOT_DIR, dbModelsMap);
    
    db.models = scannedModels;
    db.lastScan = new Date().toISOString();
    
    await saveDB(db);
    res.json({ success: true, count: scannedModels.length, lastScan: db.lastScan });
  } catch (err) {
    console.error('Erro na varredura:', err);
    res.status(500).json({ error: 'Falha ao escanear o diretório' });
  }
});

// ROTA: Obter modelos (com busca, filtros, paginação)
app.get('/api/models', async (req, res) => {
  try {
    const db = await loadDB();
    let result = [...db.models];

    const { search, category, tag, favorite, hasImages, isArchive, sort } = req.query;

    // Filtro de busca (nome, notas, tags ou caminho)
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(m => 
        m.name.toLowerCase().includes(q) ||
        m.notes.toLowerCase().includes(q) ||
        m.tags.some(t => t.toLowerCase().includes(q)) ||
        m.relativePath.toLowerCase().includes(q)
      );
    }

    // Filtro por Categoria (pasta principal ou customizada)
    if (category) {
      result = result.filter(m => {
        const cat = category.toLowerCase();
        const modelCat = m.customCategory || m.categoryPath[0] || 'Principal';
        return modelCat.toLowerCase() === cat;
      });
    }

    // Filtro por Tag
    if (tag) {
      const tQuery = tag.toLowerCase();
      result = result.filter(m => m.tags.some(t => t.toLowerCase() === tQuery));
    }

    // Filtros Rápidos
    if (favorite === 'true') {
      result = result.filter(m => m.favorite);
    }
    if (hasImages === 'true') {
      result = result.filter(m => m.images && m.images.length > 0);
    }
    if (isArchive === 'true') {
      result = result.filter(m => m.archiveFiles && m.archiveFiles.length > 0 && m.modelFiles.length === 0);
    }

    // Ordenação
    if (sort === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'date_desc') {
      result.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));
    } else if (sort === 'date_asc') {
      result.sort((a, b) => new Date(a.addedAt) - new Date(b.addedAt));
    } else {
      // Padrão: Favoritos primeiro, depois por nome
      result.sort((a, b) => {
        if (a.favorite && !b.favorite) return -1;
        if (!a.favorite && b.favorite) return 1;
        return a.name.localeCompare(b.name);
      });
    }

    // Extrair todas as categorias e tags e suas contagens globais
    const allCategories = new Set();
    const allTags = new Set();
    const categoryCounts = { _total: db.models.length };
    const tagCounts = {};
    
    db.models.forEach(m => {
      // Usar a pasta principal (primeiro nível) ou customCategory como a categoria principal
      const cat = m.customCategory || m.categoryPath[0] || 'Principal';
      
      allCategories.add(cat);
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

      m.tags.forEach(t => {
        allTags.add(t);
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });

    // Paginação
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 24;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    
    const paginatedResult = result.slice(startIndex, endIndex);

    res.json({
      models: paginatedResult,
      totalCount: result.length,
      page,
      limit,
      totalPages: Math.ceil(result.length / limit),
      allCategories: Array.from(allCategories).sort(),
      categoryCounts,
      allTags: Array.from(allTags).sort(),
      tagCounts,
      lastScan: db.lastScan
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar modelos' });
  }
});

// ROTA: Favoritar modelo
app.post('/api/models/:id/favorite', async (req, res) => {
  try {
    const db = await loadDB();
    const modelId = decodeURIComponent(req.params.id);
    const model = db.models.find(m => m.id === modelId);
    
    if (!model) {
      return res.status(404).json({ error: 'Modelo não encontrado' });
    }

    model.favorite = !model.favorite;
    await saveDB(db);
    res.json({ success: true, favorite: model.favorite });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao favoritar modelo' });
  }
});

// ROTA: Atualizar metadados (Tags, Notas, Categoria Personalizada, Rating)
app.post('/api/models/:id/metadata', async (req, res) => {
  try {
    const db = await loadDB();
    const modelId = decodeURIComponent(req.params.id);
    const model = db.models.find(m => m.id === modelId);
    
    if (!model) {
      return res.status(404).json({ error: 'Modelo não encontrado' });
    }

    const { tags, notes, customCategory, rating } = req.body;
    
    if (tags !== undefined) model.tags = Array.isArray(tags) ? tags : [];
    if (notes !== undefined) model.notes = notes;
    if (customCategory !== undefined) model.customCategory = customCategory;
    if (rating !== undefined) model.rating = parseInt(rating) || 0;

    await saveDB(db);
    res.json({ success: true, model });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar metadados' });
  }
});

// ROTA: Abrir a pasta no Windows Explorer
app.post('/api/models/:id/open', async (req, res) => {
  try {
    const modelId = decodeURIComponent(req.params.id);
    const safePath = path.normalize(modelId).replace(/^(\.\.(\/|\\))+/, '');
    const fullPath = path.join(ROOT_DIR, safePath);

    // Validação de segurança
    if (!fullPath.startsWith(ROOT_DIR)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    console.log(`Abrindo pasta no Explorer: ${fullPath}`);
    // No Windows, abre o explorer selecionando a pasta ou arquivo
    exec(`explorer.exe "${fullPath}"`, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Falha ao abrir o Windows Explorer' });
      }
      res.json({ success: true });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao processar requisição' });
  }
});

// ROTA: Servir arquivos locais (imagens e arquivos 3D) de forma segura
app.get('/api/files', (req, res) => {
  const fileRelPath = req.query.path;
  if (!fileRelPath) {
    return res.status(400).send('O caminho do arquivo é obrigatório');
  }

  // Prevenir Directory Traversal
  const safePath = path.normalize(fileRelPath).replace(/^(\.\.(\/|\\))+/, '');
  const fullPath = path.join(ROOT_DIR, safePath);

  if (!fullPath.startsWith(ROOT_DIR)) {
    return res.status(403).send('Acesso negado');
  }

  res.sendFile(fullPath, (err) => {
    if (err) {
      // Se não for encontrado, tenta procurar de forma insensível a maiúsculas/minúsculas
      if (err.status === 404) {
        // Envio de 404 limpo
        if (!res.headersSent) {
          res.status(404).send('Arquivo não encontrado');
        }
      } else {
        console.error('Erro ao enviar arquivo:', fullPath, err);
        if (!res.headersSent) {
          res.status(500).send('Erro interno do servidor');
        }
      }
    }
  });
});

// Inicialização automática: escanear se o banco estiver vazio
async function autoInit() {
  const db = await loadDB();
  if (db.models.length === 0) {
    console.log('Banco de dados vazio! Iniciando escaneamento automático...');
    const dbModelsMap = new Map();
    const scannedModels = await scanDirectory(ROOT_DIR, dbModelsMap);
    db.models = scannedModels;
    db.lastScan = new Date().toISOString();
    await saveDB(db);
    console.log(`Escaneamento concluído! Catalogados ${scannedModels.length} modelos.`);
  }
}

autoInit().then(() => {
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`   PrintCatalog 3D iniciado com sucesso!`);
    console.log(`   Acesse no seu navegador: http://localhost:${PORT}`);
    console.log(`   Varrendo modelos da pasta: ${ROOT_DIR}`);
    console.log(`==================================================`);
  });
});
