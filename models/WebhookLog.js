'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class WebhookLog extends Model {
        static associate(models) {
            // no association needed usually
        }
    }
    WebhookLog.init({
        eventType: {
            type: DataTypes.STRING,
            allowNull: false
        },
        payload: {
            type: DataTypes.JSON,
            allowNull: false
        },
        processed: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    }, {
        sequelize,
        modelName: 'WebhookLog',
    });
    return WebhookLog;
};
