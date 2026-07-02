# PrintCatalog 3D 🌀

O **PrintCatalog 3D** é uma aplicação web local de alto desempenho projetada para catalogar, pesquisar, marcar e pré-visualizar bibliotecas de arquivos de impressão 3D (`.stl`, `.3mf`, `.obj`, `.step`).

Este aplicativo varre recursivamente o diretório em que está inserido, agrupando arquivos e imagens por pastas físicas em itens catalogáveis. Ele conta com um banco de dados local leve e um visualizador 3D interativo baseado em Three.js.

---

## ✨ Funcionalidades Principais

*   **🔍 Busca e Filtragem Ultrarrápida**: Pesquise modelos por nome, tags personalizadas, notas de impressão ou caminhos físicos de pastas.
*   **📂 Agrupamento por Pastas**: Em vez de poluir a tela com milhares de partes de STL avulsas, o sistema agrupa os arquivos de uma pasta em um único item do catálogo.
*   **📂 Organização Inteligente por Pastas Principais**: Organiza automaticamente a barra lateral com base nas pastas de primeiro nível do seu diretório (ex: *Bustos*, *Articulados*, *Luminárias*).
*   **📐 Visualizador 3D Integrado (Three.js)**: Rotacione, mova e dê zoom diretamente em malhas `.stl` de forma interativa no próprio navegador sem precisar abrir outro software.
*   **📸 Detecção Inteligente de Imagens**: Identifica fotos de visualização (`.jpg`, `.png`, `.webp`) no diretório do modelo. Se não encontrar, ele busca nas pastas acima (pai/avô) para garantir que você tenha um preview.
*   **🖥️ Integração Nativa com Windows Explorer**: Clique em "Abrir no Windows Explorer" para abrir a pasta correspondente e arrastar as partes diretamente para seu fatiador (Cura, OrcaSlicer, Bambu Studio, PrusaSlicer, etc.).
*   **⭐ Favoritos e Avaliações**: Marque seus modelos prediletos e dê notas de 1 a 5 estrelas.
*   **📝 Notas e Configurações de Impressão**: Salve parâmetros de fatiamento específicos (ex: altura de camada, filamento, suportes necessários, infill).

---

## 🛠️ Pré-requisitos

Para executar este projeto, você precisa ter instalado em sua máquina:
*   [Node.js](https://nodejs.org/) (Versão 16 ou superior recomendada)

---

## 🚀 Como Instalar e Usar

1.  **Clone este repositório** dentro da sua pasta principal de modelos 3D (a pasta raiz onde você guarda todos os seus arquivos de impressão):
    ```bash
    cd /caminho/para/sua/pasta/de/modelos-3d
    git clone https://github.com/murillo-romeu/printCatalog3D.git _catalog_app
    ```
    *Nota: É importante clonar dentro de uma pasta chamada `_catalog_app` ou similar para que o sistema possa varrer a pasta pai contendo os modelos.*

2.  **Entre na pasta** do aplicativo:
    ```bash
    cd _catalog_app
    ```

3.  **Instale as dependências** do projeto:
    ```bash
    npm install
    ```

4.  **Inicie o servidor**:
    ```bash
    npm start
    ```

5.  **Acesse no seu navegador**:
    Abra o endereço: **[http://localhost:3000](http://localhost:3000)**.

> ℹ️ **Nota**: Na primeira execução, o aplicativo detectará que o banco de dados está vazio e iniciará automaticamente a varredura e indexação de todos os seus arquivos. Isso é feito de forma assíncrona e rápida.

---

## 🏗️ Estrutura do Repositório

```
_catalog_app/
├── public/                 # Interface Web Frontend
│   ├── index.html          # Interface principal do catálogo
│   ├── styles.css          # Folha de estilos (Dark Mode / Glassmorphism)
│   └── app.js              # Lógica do catálogo e Visualizador 3D Three.js
├── server.js               # Servidor Express & Algoritmo do Scanner
├── package.json            # Dependências e scripts
└── .gitignore              # Evita subir dados locais ao repositório
```

---

## ⚡ Como funciona o Scanner?

O arquivo [server.js](file:///server.js) analisa o diretório pai e mapeia:
1.  **Arquivos 3D**: `.stl`, `.3mf`, `.obj`, `.step`, `.stp`.
2.  **Arquivos Compactados**: `.rar`, `.zip`, `.7z`.
3.  **Imagens**: `.jpg`, `.jpeg`, `.png`, `.webp`, `.jfif`.

Os metadados como classificação, notas de impressão, tags e favoritos criados por você são salvos localmente em um arquivo chamado `catalog_db.json`. Esse arquivo é preservado mesmo se você clicar em **Atualizar Biblioteca** para varrer novos arquivos adicionados.
