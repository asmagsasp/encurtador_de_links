# 🔗 LinkCurto — Encurtador de URLs Profissional com Planos & Analytics

Um encurtador de URLs moderno, rápido e completo, construído em **Node.js + Express** com **SQLite** local, interface responsiva em **Glassmorphism**, suporte a **PWA (Progressive Web App)**, sistema de **Planos de Acesso**, **Cadastro de Usuários** e **Analytics detalhado**.

---

## 🚀 Principais Funcionalidades

- **Encurtamento Rápido**: Geração automática de slugs ou criação de slugs personalizados.
- **Multiusuário & Cadastro**: Telas dedicadas de Login e Registro com senhas criptografadas (`PBKDF2 + Salt`).
- **Sistema de Planos de Acesso**:
  - ⚡ **Plano Free (R$ 0,00)**: 1 link ativo, até 100 cliques, QR Code padrão.
  - 🔥 **Plano Pro (R$ 9,90/mês)**: 25 links, 5.000 cliques/link, slugs personalizados, download de QR Code em PNG, exportação CSV e analytics detalhado com gráfico de 30 dias.
  - 👑 **Plano Master VIP (R$ 19,90/mês)**: Links e cliques ILIMITADOS, data de expiração, limite manual de cliques, página de preview rica com Open Graph (OG Cards) e contagem regressiva.
- **Banners de Preços & Checkout**: Modal integrado de planos com opções de pagamento simulado via Pix (com QR Code) e Cartão de Crédito.
- **PWA (Progressive Web App)**: Instalável como aplicativo nativo no celular ou computador, com `manifest.json` e Service Worker com estratégia Network-First.
- **Exportação para CSV**: Download com codificação UTF-8 com BOM compatível com Excel.
- **Preview Rica**: Pré-visualização com card Open Graph, favicon e contagem regressiva para redirecionamento.

---

## 🛠️ Tecnologias Utilizadas

- **Backend**: Node.js, Express, better-sqlite3, express-session, qrcode, dotenv.
- **Frontend**: HTML5 Semântico, CSS Vanilla com tokens e animações, JavaScript Vanilla, Chart.js.
- **Segurança**: Criptografia de senhas nativa com `crypto.pbkdf2Sync`, proteção contra sessões inválidas e validação de URLs.

---

## 📦 Como Instalar e Rodar Localmente

1. **Clone o repositório**:
   ```bash
   git clone https://github.com/asmagsasp/encurtador_de_links.git
   cd encurtador_de_links
   ```

2. **Instale as dependências**:
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente**:
   Copie o arquivo `.env.example` para `.env`:
   ```bash
   cp .env.example .env
   ```

4. **Inicie o servidor**:
   ```bash
   npm start
   # ou
   node server.js
   ```

5. **Acesse no navegador**:
   - URL: [http://localhost:5000](http://localhost:5000)
   - Login de Administrador padrão: `admin` / `admin123` *(ou crie uma nova conta na tela de login)*.

---

## ☁️ Guia de Deploy

### 1. Render.com / Railway.app (Recomendado ⭐)
Como este projeto utiliza Node.js com SQLite local (`better-sqlite3`), plataformas de servidor contínuo com suporte a disco persistente são a escolha ideal:
- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- **Environment Variables**: Configure as mesmas chaves do arquivo `.env` (ex: `ADMIN_USER`, `ADMIN_PASS`, `SESSION_SECRET`, `BASE_URL`).

### 2. Vercel
A Vercel opera com funções **Serverless** (efêmeras e com sistema de arquivos somente leitura). Para rodar 100% na Vercel com persistência permanente de dados, recomenda-se conectar a um banco serverless (como **Turso LibSQL** ou **Supabase PostgreSQL**).

---

## 📄 Licença

Distribuído sob a licença MIT. Sinta-se livre para usar e modificar.
