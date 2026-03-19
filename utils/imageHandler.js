const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Garantir que a pasta de uploads exista
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Salva uma imagem Base64 em disco com compressão Sharp
 * @param {string} base64String 
 * @param {string} subfolder 
 * @returns {Promise<string>} Caminho relativo da imagem salva
 */
const saveBase64Image = async (base64String, subfolder = '') => {
    if (!base64String || typeof base64String !== 'string' || !base64String.includes(';base64,')) {
        return base64String;
    }

    try {
        const [meta, data] = base64String.split(';base64,');
        // Converter para .jpg para compressão otimizada
        const filename = `${uuidv4()}.jpg`;

        const targetDir = path.join(UPLOADS_DIR, subfolder);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const filePath = path.join(targetDir, filename);
        const buffer = Buffer.from(data, 'base64');

        // PROCESSAMENTO COM SHARP (Performance Máxima)
        await sharp(buffer)
            .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80, mozjpeg: true })
            .toFile(filePath);

        return `/uploads/${subfolder ? subfolder + '/' : ''}${filename}`;
    } catch (error) {
        console.error('Erro ao processar imagem com Sharp:', error);
        return null;
    }
};

module.exports = {
    saveBase64Image
};
