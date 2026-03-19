# Guia de Deploy - Backend (Catálogo) 🚀

Este documento descreve como instalar e rodar o backend em um ambiente de produção (Ubuntu/Debian).

## 1. Pré-requisitos
Certifique-se de ter os seguintes softwares instalados no servidor:
- **Node.js** (v18 ou superior)
- **NPM** (Gerenciador de pacotes)
- **MySQL Server** (ou MariaDB)
- **PM2** (Process Manager para manter o app rodando)

```bash
# Instalar PM2 globalmente
sudo npm install -g pm2
```

## 2. Instalação de Dependências
Navegue até a pasta do backend e instale os pacotes necessários:
```bash
npm install --production
```

## 3. Configuração de Variáveis de Ambiente
Crie o arquivo `.env` baseado no exemplo abaixo (não suba o `.env` para o Git):
```bash
nano .env
```
**Conteúdo sugerido:**
```env
PORT=3001
DB_NAME=catalogov3
DB_USER=seu_usuario
DB_PASS=sua_senha
DB_HOST=localhost
JWT_SECRET=coloque_uma_chave_longa_e_aleatoria
```

## 4. Banco de Dados
O sistema está configurado para sincronizar as tabelas automaticamente na primeira execução (`sequelize.sync()`). 
Basta garantir que o banco de dados especificado no `.env` já exista no MySQL.

```sql
CREATE DATABASE catalogov3;
```

## 5. Rodando em Produção com PM2
Para garantir que o backend inicie automaticamente com o servidor e não pare se houver um erro:

```bash
# Iniciar o servidor
pm2 start index.js --name "catalogo-backend"

# Salvar a lista de processos para reiniciar após reboot do sistema
pm2 save
pm2 startup
```

## 6. Logs e Monitoramento
- Ver logs em tempo real: `pm2 logs catalogo-backend`
- Dashboard de monitoramento: `pm2 monit`
- Verificar status: `pm2 status`

---
**Nota:** Para o Frontend, lembre-se de rodar `npm run build` na pasta do frontend e servir a pasta `dist` resultante via Nginx.
