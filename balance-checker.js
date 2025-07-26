const fs = require('fs');
const path = require('path');
const axios = require('axios');
const TaprootWalletGenerator = require('./wallet-generator');

class BalanceChecker {
    constructor() {
        this.generator = new TaprootWalletGenerator();
        this.apiUrls = {
            // Основные API для проверки балансов Bitcoin
            blockstream: 'https://blockstream.info/api/address/',
            blockchain: 'https://blockchain.info/q/addressbalance/',
            blockcypher: 'https://api.blockcypher.com/v1/btc/main/addrs/'
        };
    }

    // Чтение seed фраз из файла
    readSeedsFromFile(filePath = './seeds.txt') {
        try {
            const fullPath = path.resolve(filePath);
            if (!fs.existsSync(fullPath)) {
                console.error(`Файл ${fullPath} не найден`);
                return [];
            }

            const content = fs.readFileSync(fullPath, 'utf8');
            const seeds = content
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            console.log(`Загружено ${seeds.length} seed фраз из файла`);
            return seeds;
        } catch (error) {
            console.error('Ошибка при чтении файла seeds.txt:', error.message);
            return [];
        }
    }

    // Получение баланса адреса через Blockstream API
    async getBalanceBlockstream(address) {
        try {
            const response = await axios.get(`${this.apiUrls.blockstream}${address}`, {
                timeout: 10000
            });
            
            const data = response.data;
            const balanceSatoshis = data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum;
            const balanceBTC = balanceSatoshis / 100000000; // Конвертация сатоши в BTC
            
            return {
                balance: balanceBTC,
                transactions: data.chain_stats.tx_count,
                received: data.chain_stats.funded_txo_sum / 100000000,
                sent: data.chain_stats.spent_txo_sum / 100000000
            };
        } catch (error) {
            console.error(`Ошибка Blockstream API для ${address}:`, error.message);
            return null;
        }
    }

    // Получение баланса адреса через BlockCypher API
    async getBalanceBlockcypher(address) {
        try {
            const response = await axios.get(`${this.apiUrls.blockcypher}${address}/balance`, {
                timeout: 10000
            });
            
            const data = response.data;
            const balanceBTC = data.balance / 100000000;
            
            return {
                balance: balanceBTC,
                transactions: data.n_tx,
                received: data.total_received / 100000000,
                sent: data.total_sent / 100000000
            };
        } catch (error) {
            console.error(`Ошибка BlockCypher API для ${address}:`, error.message);
            return null;
        }
    }

    // Получение баланса с резервными API
    async getAddressBalance(address) {
        // Пробуем Blockstream API первым
        let balanceInfo = await this.getBalanceBlockstream(address);
        
        // Если не получилось, пробуем BlockCypher
        if (!balanceInfo) {
            console.log(`Пробуем резервный API для ${address}...`);
            balanceInfo = await this.getBalanceBlockcypher(address);
        }

        return balanceInfo;
    }

    // Проверка балансов всех адресов из seed фраз
    async checkAllBalances(addressesPerSeed = 10) {
        const seeds = this.readSeedsFromFile();
        
        if (seeds.length === 0) {
            console.log('Нет seed фраз для проверки');
            return;
        }

        let totalBTC = 0;
        let totalAddresses = 0;
        let addressesWithBalance = 0;
        const results = [];

        console.log('\n' + '='.repeat(100));
        console.log('ПРОВЕРКА БАЛАНСОВ TAPROOT КОШЕЛЬКОВ');
        console.log('='.repeat(100));

        for (let seedIndex = 0; seedIndex < seeds.length; seedIndex++) {
            const seed = seeds[seedIndex];
            console.log(`\nПроверка seed ${seedIndex + 1}/${seeds.length}:`);
            console.log(`Seed: ${seed.substring(0, 50)}...`);
            
            // Генерируем несколько адресов для каждой seed фразы
            const addresses = this.generator.generateMultipleAddresses(seed, addressesPerSeed);
            let foundBalanceInSeed = false;
            
            for (let addrIndex = 0; addrIndex < addresses.length; addrIndex++) {
                const walletInfo = addresses[addrIndex];
                const address = walletInfo.address;
                
                console.log(`  Проверка адреса ${addrIndex + 1}/${addressesPerSeed}: ${address}`);
                
                const balanceInfo = await this.getAddressBalance(address);
                totalAddresses++;
                
                if (balanceInfo) {
                    const balance = balanceInfo.balance;
                    
                    if (balance > 0) {
                        addressesWithBalance++;
                        totalBTC += balance;
                        foundBalanceInSeed = true;
                        
                        console.log(`    ✅ БАЛАНС НАЙДЕН: ${balance} BTC`);
                        console.log(`    📊 Транзакций: ${balanceInfo.transactions}`);
                        console.log(`    📈 Получено всего: ${balanceInfo.received} BTC`);
                        console.log(`    📉 Отправлено всего: ${balanceInfo.sent} BTC`);
                        
                        results.push({
                            seedIndex: seedIndex + 1,
                            seed,
                            address,
                            balance,
                            transactions: balanceInfo.transactions,
                            received: balanceInfo.received,
                            sent: balanceInfo.sent,
                            privateKey: walletInfo.privateKey
                        });
                        
                        // Найден баланс на этой seed фразе, переходим к следующей
                        console.log(`    🎯 БАЛАНС НАЙДЕН НА SEED ${seedIndex + 1} - ПЕРЕХОД К СЛЕДУЮЩЕЙ SEED`);
                        break;
                    } else {
                        console.log(`    ⭕ Баланс: 0 BTC`);
                    }
                } else {
                    console.log(`    ❌ Ошибка получения баланса`);
                }
                
                // Пауза между запросами для избежания ограничений API
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            if (!foundBalanceInSeed) {
                console.log(`    📭 На seed ${seedIndex + 1} балансы не найдены`);
            }
        }

        // Итоговый отчет
        console.log('\n' + '='.repeat(100));
        
        if (results.length > 0) {
            console.log('📝 ДЕТАЛИ НАЙДЕННЫХ БАЛАНСОВ:');
            results.forEach((result, index) => {
                console.log(`\n${index + 1}. Seed ${result.seedIndex}:`);
                console.log(`   Адрес: ${result.address}`);
                console.log(`   Баланс: ${result.balance} BTC`);
                console.log(`   Транзакций: ${result.transactions}`);
                console.log(`   Приватный ключ: ${result.privateKey}`);
            });

            // Сохранение результатов в файл
            this.saveResultsToFile(results);
        }

        // ИТОГОВАЯ СТАТИСТИКА в конце
        console.log('\n' + '='.repeat(100));
        console.log('ИТОГОВАЯ СТАТИСТИКА');
        console.log('='.repeat(100));
        console.log(`Всего seed фраз: ${seeds.length}`);
        console.log(`Найдено балансов: ${addressesWithBalance} адресов с балансами`);
        console.log(`Общий баланс: ${totalBTC.toFixed(8)} BTC (~$${(totalBTC * 45000).toFixed(2)} USD)`);
        console.log(`Всего проверено адресов: ${totalAddresses}`);

        console.log('='.repeat(100));
    }

    // Сохранение результатов в файл
    saveResultsToFile(results) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `balance_results_${timestamp}.json`;
            
            const output = {
                timestamp: new Date().toISOString(),
                totalAddressesChecked: results.length,
                totalBalance: results.reduce((sum, r) => sum + r.balance, 0),
                results: results
            };

            fs.writeFileSync(filename, JSON.stringify(output, null, 2));
            console.log(`\n💾 Результаты сохранены в файл: ${filename}`);
        } catch (error) {
            console.error('Ошибка при сохранении результатов:', error.message);
        }
    }

    // Проверка баланса конкретного адреса
    async checkSingleAddress(address) {
        console.log(`\nПроверка баланса адреса: ${address}`);
        const balanceInfo = await this.getAddressBalance(address);
        
        if (balanceInfo) {
            console.log(`Баланс: ${balanceInfo.balance} BTC`);
            console.log(`Транзакций: ${balanceInfo.transactions}`);
            console.log(`Получено всего: ${balanceInfo.received} BTC`);
            console.log(`Отправлено всего: ${balanceInfo.sent} BTC`);
        } else {
            console.log('Ошибка получения баланса');
        }
    }
}

// Основная функция
async function main() {
    const checker = new BalanceChecker();
    
    // Проверяем аргументы командной строки
    const args = process.argv.slice(2);
    
    if (args.length > 0 && args[0].startsWith('bc1p')) {
        // Проверка конкретного адреса
        await checker.checkSingleAddress(args[0]);
    } else {
        // Проверка всех адресов из seeds.txt
        const addressesPerSeed = args[0] ? parseInt(args[0]) : 5;
        await checker.checkAllBalances(addressesPerSeed);
    }
}

// Экспорт модуля
module.exports = BalanceChecker;

// Запуск если файл вызван напрямую
if (require.main === module) {
    main().catch(console.error);
}
