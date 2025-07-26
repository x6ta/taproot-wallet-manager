const bitcoin = require('bitcoinjs-lib');
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const crypto = require('crypto');
const ecc = require('tiny-secp256k1');
const fs = require('fs');
const BIP39_WORDLIST = require('./bip39-wordlist');

// Инициализация ECC для bitcoinjs-lib и bip32
bitcoin.initEccLib(ecc);
const bip32 = BIP32Factory(ecc);

class TaprootWalletGenerator {
    constructor() {
        this.network = bitcoin.networks.bitcoin; // Mainnet
    }

    // Генерация новой seed фразы с выбором количества слов
    generateSeedPhrase(wordCount = 12) {
        // Проверяем корректность количества слов
        if (wordCount !== 12 && wordCount !== 24) {
            throw new Error('Количество слов должно быть 12 или 24');
        }
        
        // 12 слов = 128 бит энтропии, 24 слова = 256 бит энтропии
        const entropyBits = wordCount === 12 ? 16 : 32;
        const entropy = crypto.randomBytes(entropyBits);
        return bip39.entropyToMnemonic(entropy);
    }

    // Альтернативная генерация используя собственный словарь BIP39
    generateCustomSeedPhrase(wordCount = 12) {
        if (wordCount !== 12 && wordCount !== 24) {
            throw new Error('Количество слов должно быть 12 или 24');
        }

        const words = [];
        for (let i = 0; i < wordCount; i++) {
            const randomIndex = crypto.randomInt(0, BIP39_WORDLIST.length);
            words.push(BIP39_WORDLIST[randomIndex]);
        }
        
        const seedPhrase = words.join(' ');
        
        // Проверяем валидность сгенерированной фразы
        if (bip39.validateMnemonic(seedPhrase)) {
            return seedPhrase;
        } else {
            // Если фраза невалидна, генерируем заново
            return this.generateSeedPhrase(wordCount);
        }
    }

    // Генерация множественных seed фраз с указанием количества слов
    generateMultipleSeeds(count = 1, wordCount = 12) {
        const seeds = [];
        for (let i = 0; i < count; i++) {
            seeds.push(this.generateSeedPhrase(wordCount));
        }
        return seeds;
    }

    // Создание Taproot адреса из seed фразы
    generateTaprootAddress(seedPhrase, addressIndex = 0) {
        try {
            // Проверка валидности seed фразы
            if (!bip39.validateMnemonic(seedPhrase)) {
                throw new Error('Невалидная seed фраза');
            }

            // Генерация seed из мнемоники
            const seed = bip39.mnemonicToSeedSync(seedPhrase);
            
            // Создание root HD ключа
            const root = bip32.fromSeed(seed, this.network);
            
            // Деривация пути для Taproot (BIP86): m/86'/0'/0'/0/addressIndex
            const path = `m/86'/0'/0'/0/${addressIndex}`;
            const child = root.derivePath(path);
            
            // Создание Taproot адреса (P2TR)
            const { address } = bitcoin.payments.p2tr({
                internalPubkey: child.publicKey.slice(1, 33), // Убираем первый байт (0x02/0x03)
                network: this.network
            });

            return {
                address,
                privateKey: child.privateKey.toString('hex'),
                publicKey: child.publicKey.toString('hex'),
                path,
                seedPhrase
            };
        } catch (error) {
            console.error('Ошибка при генерации Taproot адреса:', error.message);
            return null;
        }
    }

    // Генерация множественных адресов из одной seed фразы
    generateMultipleAddresses(seedPhrase, count = 5) {
        const addresses = [];
        for (let i = 0; i < count; i++) {
            const walletInfo = this.generateTaprootAddress(seedPhrase, i);
            if (walletInfo) {
                addresses.push(walletInfo);
            }
        }
        return addresses;
    }

    // Отображение информации о кошельке
    displayWalletInfo(walletInfo) {
        if (!walletInfo) {
            console.log('Ошибка: Невозможно отобразить информацию о кошельке');
            return;
        }

        console.log('='.repeat(80));
        console.log('TAPROOT WALLET ИНФОРМАЦИЯ');
        console.log('='.repeat(80));
        console.log(`Seed фраза: ${walletInfo.seedPhrase}`);
        console.log(`Путь деривации: ${walletInfo.path}`);
        console.log(`Taproot адрес: ${walletInfo.address}`);
        console.log(`Приватный ключ: ${walletInfo.privateKey}`);
        console.log(`Публичный ключ: ${walletInfo.publicKey}`);
        console.log('='.repeat(80));
    }

    // Сохранение результатов в файл generated.txt
    saveWalletToFile(seedPhrase, privateKey, address) {
        try {
            const data = `${seedPhrase},${privateKey},${address}\n`;
            fs.appendFileSync('generated.txt', data, 'utf8');
        } catch (error) {
            console.error('Ошибка при сохранении в файл:', error.message);
        }
    }

    // Генерация и сохранение кошельков в файл
    generateAndSaveWallets(count = 1, wordCount = 12) {
        const results = [];
        
        console.log(`\nГенерация ${count} Taproot кошельков (${wordCount} слов):\n`);
        
        for (let i = 0; i < count; i++) {
            const seedPhrase = this.generateSeedPhrase(wordCount);
            const walletInfo = this.generateTaprootAddress(seedPhrase);
            
            if (walletInfo) {
                console.log(`🔑 Кошелек ${i + 1}:`);
                console.log(`   Seed (${wordCount} слов): ${seedPhrase}`);
                console.log(`   Адрес: ${walletInfo.address}`);
                console.log(`   Приватный ключ: ${walletInfo.privateKey}`);
                console.log('');
                
                // Сохраняем в файл
                this.saveWalletToFile(seedPhrase, walletInfo.privateKey, walletInfo.address);
                
                results.push({
                    seedPhrase,
                    privateKey: walletInfo.privateKey,
                    address: walletInfo.address,
                    wordCount
                });
            }
        }
        
        console.log(`💾 Результаты сохранены в файл generated.txt`);
        return results;
    }
}

// Основная функция для демонстрации
function main() {
    const generator = new TaprootWalletGenerator();
    
    console.log('ГЕНЕРАТОР TAPROOT КОШЕЛЬКОВ\n');
    
    // Генерация новой seed фразы
    console.log('1. Генерация новой seed фразы:');
    const newSeed = generator.generateSeedPhrase();
    console.log(`Новая seed фраза: ${newSeed}\n`);
    
    // Генерация Taproot адреса
    console.log('2. Генерация Taproot адреса:');
    const walletInfo = generator.generateTaprootAddress(newSeed);
    generator.displayWalletInfo(walletInfo);
    
    // Генерация множественных адресов
    console.log('\n3. Генерация множественных адресов:');
    const multipleAddresses = generator.generateMultipleAddresses(newSeed, 3);
    multipleAddresses.forEach((wallet, index) => {
        console.log(`\nАдрес ${index + 1}: ${wallet.address}`);
        console.log(`Путь: ${wallet.path}`);
    });
    
    // Генерация множественных seed фраз
    console.log('\n4. Генерация множественных seed фраз:');
    const multipleSeeds = generator.generateMultipleSeeds(3);
    multipleSeeds.forEach((seed, index) => {
        console.log(`Seed ${index + 1}: ${seed}`);
        const address = generator.generateTaprootAddress(seed);
        console.log(`Taproot адрес: ${address.address}\n`);
    });
}

// Экспорт модуля
module.exports = TaprootWalletGenerator;

// Запуск если файл вызван напрямую
if (require.main === module) {
    main();
}
