require('dotenv').config(); // Trigger Restart v2
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./models');
const { Op } = require('sequelize');
const path = require('path');
const { saveBase64Image } = require('./utils/imageHandler');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
    'http://localhost:8080',
    'http://localhost:3000',
    'https://putariaonlinebr.com.br',
    'https://www.putariaonlinebr.com.br'
];

app.use(cors({
    origin: function (origin, callback) {
        // permitindo requisições sem origin (como apps mobile ou curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'A política CORS para este site não permite acesso a partir da Origem especificada.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- SERVIR ARQUIVOS ESTÁTICOS (UPLOADS) ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- INTEGRAÇÃO ASAAS (PIX) ---
const axios = require('axios');
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_URL = process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3';

// Configuração padrão do Axios para o Asaas
const asaasApi = axios.create({
    baseURL: ASAAS_URL,
    headers: { 'access_token': ASAAS_API_KEY }
});

// CONFIGURAÇÃO SMTP HOSTINGER (Nodemailer)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: process.env.SMTP_PORT || 465,
    secure: true, // true para 465, false para outras portas
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});




// Middleware de Autenticação
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido' });
        req.user = user;
        next();
    });
};

const authenticateAdmin = (req, res, next) => {
    authenticateToken(req, res, async () => {
        const user = await db.User.findByPk(req.user.id);
        if (user && user.role === 'admin') {
            next();
        } else {
            res.status(403).json({ error: 'Acesso negado. Requer privilégios de administrador.' });
        }
    });
};

// --- ROTAS DE AUTENTICAÇÃO ---

// Registro
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, cpf, birthDate, phone, rgFrenteUrl, rgVersoUrl } = req.body;

        const existingUser = await db.User.findOne({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'E-mail já cadastrado' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Salvar RGs em disco (com Sharp)
        const savedRgFront = await saveBase64Image(rgFrenteUrl, 'docs');
        const savedRgBack = await saveBase64Image(rgVersoUrl, 'docs');

        const verificationToken = crypto.randomBytes(32).toString('hex');

        const user = await db.User.create({
            name,
            email,
            password: hashedPassword,
            cpf,
            birthDate,
            phone,
            rgFront: savedRgFront,
            rgBack: savedRgBack,
            status: 'pending',
            emailVerified: false,
            verificationToken: verificationToken
        });

        // ENVIAR E-MAIL DE CONFIRMAÇÃO
        const verifyUrl = `${process.env.SITE_URL || 'https://putariaonlinebr.com.br'}/api/auth/verify-email/${verificationToken}`;

        const mailOptions = {
            from: `"Putaria Online" <${process.env.SMTP_USER}>`,
            to: email,
            subject: 'Confirme seu e-mail - Putaria Online',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #d6244a; text-align: center;">Bem-vinda ao Putaria Online!</h2>
                    <p>Olá <strong>${name}</strong>,</p>
                    <p>Obrigado por se cadastrar em nossa plataforma. Para concluir seu cadastro e permitir que nossa equipe analise seu perfil, você precisa confirmar seu endereço de e-mail.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${verifyUrl}" style="background-color: #d6244a; color: white; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">CONFIRMAR MEU E-MAIL</a>
                    </div>
                    <p style="font-size: 0.9rem; color: #666;">Se o botão não funcionar, copie e cole o link abaixo no seu navegador:</p>
                    <p style="font-size: 0.8rem; color: #888; word-break: break-all;">${verifyUrl}</p>
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 0.8rem; color: #999; text-align: center;">Este é um e-mail automático. Por favor, não responda.</p>
                </div>
            `
        };

        transporter.sendMail(mailOptions).catch(err => console.error("Erro ao enviar e-mail:", err));

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ message: 'Conta criada. Verifique seu e-mail!', token, user: { id: user.id, name: user.name, email: user.email, status: user.status } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await db.User.findOne({ where: { email } });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }

        if (user.status === 'rejected') {
            return res.status(403).json({ error: 'Sua conta foi reprovada.', status: 'rejected' });
        }

        const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, name: user.name, email: user.email, status: user.status, emailVerified: user.emailVerified } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Verificação de E-mail
app.get('/api/auth/verify-email/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const user = await db.User.findOne({ where: { verificationToken: token } });

        if (!user) {
            return res.status(400).send('<h1>Token inválido ou expirado.</h1>');
        }

        await user.update({
            emailVerified: true,
            verificationToken: null
        });

        res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #2ecc71;">E-mail Verificado com Sucesso!</h1>
                <p>Obrigada por confirmar seu e-mail. Agora seu perfil entrará em nossa fila de análise.</p>
                <a href="${process.env.SITE_URL || 'https://putariaonlinebr.com.br'}/dashboard" style="display: inline-block; background: #d6244a; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin-top: 20px;">Voltar ao Dashboard</a>
            </div>
        `);
    } catch (error) {
        res.status(500).send('Erro ao verificar e-mail.');
    }
});

// --- ROTAS DO CATÁLOGO PÚBLICO ---

// Obter Modelos (Somente aprovadas ou ativas)
app.get('/api/public/models', async (req, res) => {
    try {
        const users = await db.User.findAll({
            where: {
                status: { [db.Sequelize.Op.or]: ['approved', 'active'] },
                role: 'user' // Não mostrar administradores no catálogo
            },
            attributes: { exclude: ['password', 'cpf', 'phone', 'email'] },
            order: [
                // 1. Quem impulsionou (e o horário já passou/chegou)
                [db.Sequelize.literal('CASE WHEN boostedAt IS NOT NULL AND boostedAt <= NOW() THEN boostedAt ELSE "1970-01-01" END'), 'DESC'],
                // 2. Por cliques (Popularidade)
                ['clicks', 'DESC'],
                // 3. Ordem de ID (Recência)
                ['id', 'DESC']
            ]
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- ROTAS DE PERFIL (CRUD) ---

// Obter Perfil
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const user = await db.User.findByPk(req.user.id, {
            attributes: { exclude: ['password'] }
        });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Editar Perfil
app.put('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const { name, bio, whatsapp, telegram, instagram, externalLink, coverPhotoUrl, galleryPhotos } = req.body;
        const user = await db.User.findByPk(req.user.id);

        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        // Salvar Capa em disco (com Sharp)
        const savedCover = await saveBase64Image(coverPhotoUrl, 'profiles');

        // Processar Galeria (pode vir como array ou string JSON)
        let galleryArray = Array.isArray(galleryPhotos) ? galleryPhotos : JSON.parse(galleryPhotos || '[]');

        // Converter apenas os Base64s da galeria (processamento paralelo com Sharp)
        const savedGallery = await Promise.all(galleryArray.map(photo => saveBase64Image(photo, 'profiles')));

        await user.update({
            name,
            bio,
            whatsapp,
            telegram,
            instagram,
            externalLink,
            coverPhotoUrl: savedCover,
            galleryPhotos: JSON.stringify(savedGallery)
        });

        res.json({ message: 'Perfil atualizado com sucesso', user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- ROTAS DE OPERAÇÕES DE USUÁRIO ---

// Impulsionar Perfil (Boost)
app.post('/api/user/boost', authenticateToken, async (req, res) => {
    try {
        const { date } = req.body || {}; // Proteção contra body nulo
        const user = await db.User.findByPk(req.user.id);

        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        const boostCost = 50;
        if (user.credits < boostCost) {
            return res.status(400).json({ error: 'Créditos insuficientes para impulsionar.' });
        }

        const boostTime = date ? new Date(date) : new Date();

        await user.update({
            credits: user.credits - boostCost,
            boostedAt: boostTime
        });

        res.json({
            message: date ? 'Impulsionamento agendado!' : 'Perfil impulsionado para o Top 1!',
            credits: user.credits,
            boostedAt: boostTime
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Alterar Senha
app.put('/api/user/password', authenticateToken, async (req, res) => {
    try {
        const { newPassword } = req.body;
        const user = await db.User.findByPk(req.user.id);

        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await user.update({ password: hashedPassword });

        res.json({ message: 'Senha alterada com sucesso' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- ROTAS DE ANALYTICS (NÚCLEO DO ECHARTS) ---



// POST: Registrar Evento de Analytics (Público, chamado pelo Catálogo)
app.post('/api/analytics/track', async (req, res) => {
    try {
        const { modelId, eventType, linkType } = req.body;
        if (!modelId || !eventType) return res.status(400).send();

        // Registrar o evento detalhado
        await db.AnalyticsEvent.create({ modelId, eventType, linkType });

        // Incrementar o contador de cliques denormalizado para ranking rápido
        if (eventType === 'profile_view' || eventType === 'link_click') {
            await db.User.increment('clicks', { where: { id: modelId } });
        }

        res.status(204).send();
    } catch (e) {
        console.error("Erro no Tracker:", e);
        res.status(500).send();
    }
});

// GET: Painel de Controle de Analytics (Privado)
app.get('/api/analytics/dashboard', authenticateToken, async (req, res) => {
    try {
        const period = req.query.period || 'weekly';
        const daysOffset = period === 'monthly' ? 30 : 7;
        const now = new Date();
        // Resetar para o início do dia para garantir que pega tudo de 'hoje'
        now.setHours(23, 59, 59, 999);

        const currentStart = new Date(now);
        currentStart.setDate(currentStart.getDate() - daysOffset);
        currentStart.setHours(0, 0, 0, 0); // Início do período

        const previousStart = new Date(currentStart);
        previousStart.setDate(previousStart.getDate() - daysOffset);

        const modelId = Number(req.user.id);
        if (isNaN(modelId)) return res.status(400).json({ error: 'ID de usuário inválido no token' });

        // Current KPIs
        const currentTotalViews = await db.AnalyticsEvent.count({
            where: { modelId, eventType: 'profile_view', createdAt: { [Op.gte]: currentStart } }
        });
        const currentLinkClicks = await db.AnalyticsEvent.count({
            where: { modelId, eventType: 'link_click', createdAt: { [Op.gte]: currentStart } }
        });

        // Previous KPIs
        const prevTotalViews = await db.AnalyticsEvent.count({
            where: { modelId, eventType: 'profile_view', createdAt: { [Op.between]: [previousStart, currentStart] } }
        });
        const prevLinkClicks = await db.AnalyticsEvent.count({
            where: { modelId, eventType: 'link_click', createdAt: { [Op.between]: [previousStart, currentStart] } }
        });

        const calcPercent = (curr, prev) => prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

        // Group By Day (Chart Series)
        const events = await db.AnalyticsEvent.findAll({
            where: { modelId, createdAt: { [Op.gte]: currentStart } },
            attributes: [
                [db.Sequelize.fn('DATE', db.Sequelize.col('createdAt')), 'date'],
                'eventType',
                [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'count']
            ],
            group: ['date', 'eventType'],
            raw: true
        });

        // Link Campeão
        const topLink = await db.AnalyticsEvent.findOne({
            where: { modelId, eventType: 'link_click', createdAt: { [Op.gte]: currentStart } },
            attributes: ['linkType', [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'count']],
            group: ['linkType'],
            order: [[db.Sequelize.literal('count'), 'DESC']],
            raw: true
        });

        res.json({
            stats: {
                totalViews: currentTotalViews,
                viewsGrowth: calcPercent(currentTotalViews, prevTotalViews),
                linkClicks: currentLinkClicks,
                clicksGrowth: calcPercent(currentLinkClicks, prevLinkClicks),
                conversion: currentTotalViews > 0 ? ((currentLinkClicks / currentTotalViews) * 100).toFixed(1) : 0,
                topLink: topLink ? topLink.linkType : 'N/A'
            },
            chartData: events
        });

    } catch (e) {
        console.error("Erro no GetAnalytics:", e);
        res.status(500).send();
    }
});

// --- ROTAS DE PAGAMENTO (ASAAS PIX) ---

// Listar Planos (Público/Autenticado)
app.get('/api/payments/plans', async (req, res) => {
    try {
        const plans = await db.Plan.findAll();
        res.json(plans);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/payments/create-intent', authenticateToken, async (req, res) => {
    try {
        const { planId, taxId } = req.body;
        const user = await db.User.findByPk(req.user.id);

        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        // 1. Buscar detalhes do plano no banco de dados
        const plan = await db.Plan.findByPk(planId);
        if (!plan) return res.status(400).json({ error: 'Plano inválido' });

        // 2. Garantir que o usuário seja um cliente no Asaas
        let asaasCustomerId = user.asaasCustomerId;
        if (!asaasCustomerId) {
            const customerRes = await asaasApi.post('/customers', {
                name: user.name,
                email: user.email,
                cpfCnpj: taxId.replace(/\D/g, '') // Limpar CPF
            });
            asaasCustomerId = customerRes.data.id;
            await user.update({ asaasCustomerId });
        }

        // 2. Criar a cobrança
        // Data de hoje formatada YYYY-MM-DD
        const dueDate = new Date().toISOString().split('T')[0];

        const paymentRes = await asaasApi.post('/payments', {
            customer: asaasCustomerId,
            billingType: 'PIX',
            value: plan.price,
            dueDate: dueDate
        });

        const asaasPaymentId = paymentRes.data.id;

        // 3. Obter o QR Code
        const qrRes = await asaasApi.get(`/payments/${asaasPaymentId}/pixQrCode`);
        const { encodedImage, payload } = qrRes.data;

        // 4. Registrar a intenção no DB (usando paymentIntentId como campo genérico para o Asaas ID)
        await db.Sale.create({
            userId: user.id,
            amount: Math.round(plan.price * 100),
            credits: plan.credits,
            paymentIntentId: asaasPaymentId,
            status: 'pending'
        });

        res.json({
            qrCode: `data:image/png;base64,${encodedImage}`,
            copyPaste: payload,
            paymentId: asaasPaymentId
        });

    } catch (error) {
        console.error("Erro Asaas:", error.response?.data || error.message);
        res.status(500).json({ error: error.response?.data?.errors?.[0]?.description || 'Erro ao gerar PIX' });
    }
});

// Polling de status do pagamento (opcional mas bom para o frontend)
app.get('/api/payments/status/:paymentIntentId', authenticateToken, async (req, res) => {
    try {
        const sale = await db.Sale.findOne({
            where: { paymentIntentId: req.params.paymentIntentId, userId: req.user.id }
        });
        if (!sale) return res.status(404).json({ error: 'Venda não encontrada' });
        res.json({ status: sale.status });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// WEBHOOK ASAAS: Processamento automático de pagamentos
app.post('/api/webhooks/asaas', async (req, res) => {
    try {
        const payload = req.body;
        console.log(`[ASAAS WEBHOOK] Evento recebido: ${payload.event} para pagamento: ${payload.payment?.id}`);

        // 1. Gravar LOG de todas as mensagens
        const log = await db.WebhookLog.create({
            eventType: payload.event,
            payload: payload,
            processed: false
        });

        // 2. Validar Token de Segurança
        const authToken = req.headers['asaas-access-token'];
        if (process.env.ASAAS_WEBHOOK_TOKEN && authToken !== process.env.ASAAS_WEBHOOK_TOKEN) {
            console.error("[ASAAS WEBHOOK] Token inválido!");
            return res.status(401).send();
        }

        // 3. Processar Pagamento Confirmado
        if (payload.event === 'PAYMENT_RECEIVED' || payload.event === 'PAYMENT_CONFIRMED') {
            const paymentId = payload.payment.id;
            console.log(`[ASAAS WEBHOOK] Buscando Venda com Intent: ${paymentId}`);

            const sale = await db.Sale.findOne({ where: { paymentIntentId: paymentId } });

            if (!sale) {
                console.warn(`[ASAAS WEBHOOK] Venda não encontrada para Intent: ${paymentId}`);
            } else if (sale.status === 'pending') {
                const user = await db.User.findByPk(sale.userId);
                if (user) {
                    await db.sequelize.transaction(async (t) => {
                        // Atualizar Venda
                        await sale.update({ status: 'completed' }, { transaction: t });
                        // Creditar Usuário
                        await user.increment('credits', { by: sale.credits, transaction: t });
                        // Marcar log como processado
                        await log.update({ processed: true }, { transaction: t });
                        console.log(`[ASAAS WEBHOOK] SUCESSO: ${sale.credits} créditos entregues ao user ${user.id}`);
                    });
                } else {
                    console.error(`[ASAAS WEBHOOK] Usuário ${sale.userId} não encontrado para a venda ${sale.id}`);
                }
            } else {
                console.log(`[ASAAS WEBHOOK] Venda ${sale.id} já estava com status: ${sale.status}`);
                await log.update({ processed: true });
            }
        } else {
            // Outros eventos (vencimento, etc), apenas marcar como ok para não disparar retry
            await log.update({ processed: true });
        }

        res.status(200).send('OK');
    } catch (error) {
        console.error("[ASAAS WEBHOOK] Erro Crítico:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- ROTAS ADMINISTRATIVAS ---

// Login Admin
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await db.User.findOne({ where: { email, role: 'admin' } });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Credenciais administrativas inválidas' });
        }

        const token = jwt.sign({ id: user.id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Dashboard Stats (KPIs Reais)
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
    try {
        const totalUsers = await db.User.count({ where: { role: 'user' } });
        const activeUsers = await db.User.count({ where: { role: 'user', status: 'active' } });
        const pendingUsers = await db.User.count({ where: { role: 'user', status: 'pending' } });

        // Faturamento Total (Soma de Vendas Completas)
        const totalRevenue = await db.Sale.sum('amount', { where: { status: 'completed' } }) || 0;

        res.json({
            totalUsers,
            activeUsers,
            pendingUsers,
            totalRevenue: (totalRevenue / 100).toFixed(2), // Converter centavos para Real
            revenueInCents: totalRevenue
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Listar Usuários para Gestão
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
    try {
        const users = await db.User.findAll({
            where: { role: 'user' },
            order: [['createdAt', 'DESC']]
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Atualizar Status (Aprovar/Reprovar)
app.put('/api/admin/users/:id/status', authenticateAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        const user = await db.User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        await user.update({ status });
        res.json({ message: `Status do usuário atualizado para ${status}` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Atualizar Usuário Completo (Edição Admin)
app.put('/api/admin/users/:id', authenticateAdmin, async (req, res) => {
    try {
        const { name, email, credits, status } = req.body;
        const user = await db.User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

        await user.update({
            name: name || user.name,
            email: email || user.email,
            credits: credits !== undefined ? credits : user.credits,
            status: status || user.status
        });

        res.json({ message: 'Usuário atualizado com sucesso' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- ROTAS DE GESTÃO DE PLANOS ---
app.get('/api/admin/plans', authenticateAdmin, async (req, res) => {
    try {
        const plans = await db.Plan.findAll();
        res.json(plans);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/plans/:id', authenticateAdmin, async (req, res) => {
    try {
        const { price, credits } = req.body;
        const plan = await db.Plan.findByPk(req.params.id);
        if (!plan) return res.status(404).json({ error: 'Plano não encontrado' });

        await plan.update({ price, credits });
        res.json({ message: 'Plano atualizado com sucesso' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Estatísticas Financeiras Detalhadas
app.get('/api/admin/finance', authenticateAdmin, async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // 1. Faturamento Total (Geral)
        const totalSales = await db.Sale.sum('amount', { where: { status: 'completed' } }) || 0;

        // 2. Faturamento Mensal (Mês Atual)
        const monthlySales = await db.Sale.sum('amount', {
            where: {
                status: 'completed',
                createdAt: { [db.Sequelize.Op.gte]: startOfMonth }
            }
        }) || 0;

        // 3. Faturamento Hoje
        const dailySales = await db.Sale.sum('amount', {
            where: {
                status: 'completed',
                createdAt: { [db.Sequelize.Op.gte]: startOfToday }
            }
        }) || 0;

        // 4. Projeção Mensal
        const currentDay = now.getDate();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const projection = currentDay > 0 ? (monthlySales / currentDay) * daysInMonth : 0;

        // 5. Histórico e Vendas Recentes
        const recentSales = await db.Sale.findAll({
            where: { status: 'completed' },
            include: [{ model: db.User, attributes: ['name', 'email'] }],
            order: [['createdAt', 'DESC']],
            limit: 50
        });

        // Agrupar por dia (últimos 30 dias)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dailyData = await db.Sale.findAll({
            attributes: [
                [db.sequelize.fn('DATE', db.sequelize.col('createdAt')), 'date'],
                [db.sequelize.fn('SUM', db.sequelize.col('amount')), 'total']
            ],
            where: {
                status: 'completed',
                createdAt: { [db.Sequelize.Op.gte]: thirtyDaysAgo }
            },
            group: [db.sequelize.fn('DATE', db.sequelize.col('createdAt'))],
            order: [[db.sequelize.fn('DATE', db.sequelize.col('createdAt')), 'DESC']]
        });

        res.json({
            summary: {
                total: totalSales / 100,
                monthly: monthlySales / 100,
                daily: dailySales / 100,
                projection: projection / 100
            },
            recentSales: recentSales.map(s => ({
                id: s.id,
                userName: s.User?.name || 'Usuário Excluído',
                amount: s.amount / 100,
                credits: s.credits,
                date: s.createdAt
            })),
            dailyHistory: dailyData.map(d => ({
                date: d.get('date'),
                amount: d.get('total') / 100
            }))
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Inicialização segura
db.sequelize.sync().then(async () => {
    // Garantir Admin Padrão
    const adminExists = await db.User.findOne({ where: { role: 'admin' } });
    if (!adminExists) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await db.User.create({
            name: 'Administrador Mestre',
            email: 'admin@admin.com',
            password: hashedPassword,
            role: 'admin',
            status: 'active'
        });
        console.log('Admin padrão criado: admin@admin.com / admin123');
    }

    // Garantir Planos Padrão
    const planCount = await db.Plan.count();
    if (planCount === 0) {
        await db.Plan.bulkCreate([
            { id: 'basic', price: 19.90, credits: 100 },
            { id: 'popular', price: 89.90, credits: 500 },
            { id: 'premium', price: 159.90, credits: 1000 }
        ]);
        console.log('Planos iniciais criados.');
    }

    app.listen(PORT, () => {
        console.log(`Backend rodando na porta ${PORT}`);
    });
}).catch(err => {
    console.error('Erro ao conectar ao banco de dados:', err);
});
