const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Garantir que a pasta de uploads exista
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Salva uma imagem em Base64 para o disco.
 * @param {string} base64String A string base64 completa (com prefixo data:image/...)
 * @param {string} subfolder Subpasta dentro de uploads (ex: 'profiles', 'docs')
 * @returns {string|null} O caminho relativo para salvar no banco ou null se inválido
 */
const saveBase64Image = (base64String, subfolder = '') => {
    if (!base64String || typeof base64String !== 'string' || !base64String.includes(';base64,')) {
        return base64String; // Retorna o que recebeu se não for Base64 (pode ser um path já existente)
    }

    try {
        const [meta, data] = base64String.split(';base64,');
        const extension = meta.split('/')[1].split('+')[0]; // ex: png, jpeg
        const filename = `${uuidv4()}.${extension}`;

        const targetDir = path.join(UPLOADS_DIR, subfolder);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const filePath = path.join(targetDir, filename);
        const buffer = Buffer.from(data, 'base64');

        fs.writeFileSync(filePath, buffer);

        // Retorna o path relativo que será servido pelo Express
        return `/uploads/${subfolder ? subfolder + '/' : ''}${filename}`;
    } catch (error) {
        console.error('Erro ao salvar imagem:', error);
        return null;
    }
};

module.exports = {
    saveBase64Image
};
