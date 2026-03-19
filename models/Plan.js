'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Plan extends Model { }
    Plan.init({
        id: {
            type: DataTypes.STRING,
            primaryKey: true // basic, popular, premium
        },
        price: {
            type: DataTypes.FLOAT,
            allowNull: false
        },
        credits: {
            type: DataTypes.INTEGER,
            allowNull: false
        }
    }, {
        sequelize,
        modelName: 'Plan',
    });
    return Plan;
};
