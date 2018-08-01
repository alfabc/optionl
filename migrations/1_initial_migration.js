const Migrations = artifacts.require('./Migrations.sol');

module.exports = function migration(deployer) {
  deployer.deploy(Migrations);
};
