'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Sale extends Model {
        static associate(models) {
            Sale.belongsTo(models.User, { foreignKey: 'userId' });
        }
    }
    Sale.init({
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        amount: {
            type: DataTypes.INTEGER, // centavos
            allowNull: false
        },
        credits: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        paymentIntentId: {
            type: DataTypes.STRING,
            allowNull: false
        },
        status: {
            type: DataTypes.STRING,
            defaultValue: 'pending' // pending, completed, failed
        },
        pixCode: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'Sale',
    });
    return Sale;
};
