'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class User extends Model {
        static associate(models) {
            User.hasMany(models.AnalyticsEvent, { foreignKey: 'modelId', as: 'analytics' });
        }
    }
    User.init({
        name: {
            type: DataTypes.STRING,
            allowNull: false
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: {
                isEmail: true
            }
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false
        },
        cpf: {
            type: DataTypes.STRING,
            unique: true
        },
        birthDate: {
            type: DataTypes.DATEONLY
        },
        phone: {
            type: DataTypes.STRING
        },
        clicks: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        bio: {
            type: DataTypes.TEXT
        },
        whatsapp: {
            type: DataTypes.STRING
        },
        telegram: {
            type: DataTypes.STRING
        },
        instagram: {
            type: DataTypes.STRING
        },
        externalLink: {
            type: DataTypes.STRING
        },
        coverPhotoUrl: {
            type: DataTypes.TEXT('long')
        },
        galleryPhotos: {
            type: DataTypes.TEXT('long'),
            defaultValue: '[]'
        },
        credits: {
            type: DataTypes.INTEGER,
            defaultValue: 0
        },
        asaasCustomerId: {
            type: DataTypes.STRING,
            allowNull: true
        },
        role: {
            type: DataTypes.STRING,
            defaultValue: 'user' // user, admin
        },
        rgFront: {
            type: DataTypes.STRING,
            allowNull: true
        },
        rgBack: {
            type: DataTypes.STRING,
            allowNull: true
        },
        status: {
            type: DataTypes.STRING,
            defaultValue: 'pending' // pending, approved, rejected
        },
        boostedAt: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'User',
    });
    return User;
};
