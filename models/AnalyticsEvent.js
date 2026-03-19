'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class AnalyticsEvent extends Model {
        static associate(models) {
            AnalyticsEvent.belongsTo(models.User, { foreignKey: 'modelId', as: 'model' });
        }
    }
    AnalyticsEvent.init({
        modelId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        eventType: {
            // 'profile_view', 'link_click'
            type: DataTypes.STRING,
            allowNull: false
        },
        linkType: {
            // 'whatsapp', 'telegram', 'instagram', 'external', or null
            type: DataTypes.STRING,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'AnalyticsEvent',
    });
    return AnalyticsEvent;
};
