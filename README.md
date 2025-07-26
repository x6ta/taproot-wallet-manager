# 🚀 Taproot Wallet Manager

Профессиональная программа для работы с Bitcoin Taproot кошельками (P2TR адреса) с поддержкой BIP86 стандарта.

## 📋 Описание

Это полнофункциональная программа для работы с Bitcoin Taproot кошельками, которая предоставляет два основных функционала:

1. **🏦 Проверка балансов** - Массовая проверка балансов Taproot адресов из seed фраз
2. **🔐 Генерация кошельков** - Создание новых seed фраз и соответствующих Taproot адресов

## ⚡ Основные возможности

- ✅ **Реальная сеть Bitcoin** (mainnet) - без тестовых режимов
- ✅ **BIP86 стандарт** для Taproot адресов (P2TR)
- ✅ **Множественные API** - Blockstream.info (основной) + BlockCypher (резервный)
- ✅ **Интерактивный режим** - удобное меню для работы
- ✅ **CLI режим** - прямое выполнение команд
- ✅ **Автосохранение** результатов в JSON формате
- ✅ **Детальная статистика** по всем операциям
- ✅ **Приватные ключи** в результатах проверки

## 🛠 Установка

### Требования
- Node.js версии 14 или выше
- npm (входит в комплект Node.js)

### Установка зависимостей

```bash
npm install
```

### Структура проекта
```
taproot/
├── index.js              # Главный файл приложения
├── wallet-generator.js   # Модуль генерации кошельков
├── balance-checker.js    # Модуль проверки балансов
├── bip39-wordlist.js    # Словарь BIP39 слов
├── seeds.txt            # Входной файл с seed фразами
├── generated.txt        # Выходной файл для сгенерированных кошельков
├── package.json         # Конфигурация проекта
└── README.md           # Документация
```

## 🚀 Использование

### Интерактивный режим
```bash
node index.js
```

После запуска вы увидите меню:
```
🚀 TAPROOT WALLET MANAGER 🚀
1. 🏦 Проверить балансы из seeds.txt
2. 🔐 Генерировать seed фразы
3. ❌ Выход
```

### CLI режим

#### Проверка балансов
```bash
node index.js check
```

#### Генерация seed фраз
```bash

```

## 📁 Работа с файлами

### seeds.txt
Файл должен содержать seed фразы, по одной на строку:
```
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong
your seed phrase here with twelve or twenty four words
```

### generated.txt
Автоматически создается при генерации новых кошельков:
```
Дата: 2025-07-26
Seed: abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
Адрес: bc1p...
Приватный ключ: a1b2c3...
```

### Результаты проверки
Автоматически сохраняются в файлы вида `balance_results_YYYY-MM-DDTHH-MM-SS-sssZ.json`:
```json
{
  "timestamp": "2025-07-26T14:17:18.752Z",
  "totalAddressesChecked": 7,
  "totalBalance": 0.01638240,
  "results": [
    {
      "seedIndex": 1,
      "seed": "your seed phrase",
      "address": "bc1p...",
      "balance": 0.0015477,
      "transactions": 75,
      "received": 0.02465994,
      "sent": 0.02311224,
      "privateKey": "a918ca4c..."
    }
  ]
}
```

## 🔧 Технические детали

### Bitcoin стандарты
- **BIP39** - Генерация мнемонических seed фраз
- **BIP32** - Иерархические детерминистские кошельки (HD)
- **BIP86** - Деривация путей для Taproot адресов

### Derivation Path
```
m/86'/0'/0'/0/0  - для mainnet Taproot адресов
```

### API провайдеры
1. **Blockstream.info** (основной)
   - Endpoint: `https://blockstream.info/api/address/{address}`
   - Лимит: разумное использование

2. **BlockCypher** (резервный)
   - Endpoint: `https://api.blockcypher.com/v1/btc/main/addrs/{address}/balance`
   - Лимит: 3 запроса в секунду без токена

### Зависимости
```json
{
  "bitcoinjs-lib": "^6.1.5",
  "bip32": "^4.0.0",
  "tiny-secp256k1": "^2.2.3"
}
```

## 📊 Пример вывода

### Проверка балансов
```
====================================================================================================
ПРОВЕРКА БАЛАНСОВ TAPROOT КОШЕЛЬКОВ
====================================================================================================
Проверка seed 1/7:
Seed: abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
Адрес: bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr
✅ Найден баланс: 0.00000546 BTC (546 satoshi)

📝 ДЕТАЛИ НАЙДЕННЫХ БАЛАНСОВ:

1. Seed 1:
   Адрес: bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr
   Баланс: 0.00000546 BTC
   Транзакций: 1
   Приватный ключ: a918ca4ca9c437056a037f91e3dfed5241cbca5a19f3779e3f34d5bfb2929b7d

====================================================================================================
ИТОГОВАЯ СТАТИСТИКА
====================================================================================================
Всего seed фраз: 1
Найдено балансов: 1 адресов с балансами
Общий баланс: 0.00000546 BTC (~$0.25 USD)
Всего проверено адресов: 1
====================================================================================================
```

### Генерация кошельков
```
====================================================================================================
ГЕНЕРАТОР TAPROOT КОШЕЛЬКОВ
====================================================================================================
Выберите количество слов в seed фразе:
1. 12 слов (стандартный)
2. 24 слова (повышенная безопасность)

Сгенерированная seed фраза (12 слов):
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about

Taproot адрес: bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr
Приватный ключ: a918ca4ca9c437056a037f91e3dfed5241cbca5a19f3779e3f34d5bfb2929b7d

💾 Кошелек сохранен в файл generated.txt
```

## ⚠️ Важные замечания

### Безопасность
- **НИКОГДА** не передавайте приватные ключи третьим лицам
- **ВСЕГДА** храните seed фразы в безопасном месте
- **НИКОГДА** не вводите реальные seed фразы на незнакомых сайтах
- Программа работает только с **реальной сетью Bitcoin** (mainnet)

### Ограничения API
- Соблюдайте лимиты запросов к API
- При большом количестве адресов возможны задержки
- Рекомендуется не более 100 проверок за раз

### Резервное копирование
- Регулярно создавайте резервные копии `seeds.txt`
- Сохраняйте результаты проверок в безопасном месте
- Ведите учет всех сгенерированных кошельков

## 🆘 Устранение неполадок

### Ошибки установки
```bash
# Очистка кеша npm
npm cache clean --force

# Переустановка зависимостей
rm -rf node_modules package-lock.json
npm install
```

### Ошибки API
- Проверьте подключение к интернету
- Убедитесь, что API сервисы доступны
- При превышении лимитов подождите и повторите попытку

### Ошибки валидации seed фраз
- Убедитесь, что seed фразы содержат правильное количество слов (12 или 24)
- Проверьте, что все слова есть в BIP39 словаре
- Убедитесь в правильности написания слов

## 📞 Поддержка

Если у вас возникли вопросы или проблемы:
1. Проверьте этот README файл
2. Убедитесь, что все зависимости установлены
3. Проверьте формат входных файлов
4. Проверьте подключение к интернету

## 📄 Лицензия

Этот проект предназначен для образовательных и исследовательских целей. Используйте ответственно.

---
**Создано с ❤️ для Bitcoin сообщества**
```

### Командная строка

#### Проверка балансов из seeds.txt
```bash
npm run balance
# или
node index.js balance
```

#### Генерация seed фраз
```bash
node index.js seeds 5
```

## Настройка

1. Создайте файл `seeds.txt` в корне проекта
2. Добавьте seed фразы (каждая с новой строки)
3. Запустите программу

### Пример seeds.txt
```
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
urban abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon
```

## Структура проекта

- `index.js` - главный файл с интерфейсом
- `wallet-generator.js` - генератор Taproot кошельков
- `balance-checker.js` - проверка балансов через API
- `seeds.txt` - файл с seed фразами для проверки
- `package.json` - зависимости проекта

## API для проверки балансов

Программа использует следующие API:
- Blockstream.info (основной)
- BlockCypher (резервный)

## Безопасность

⚠️ **ВНИМАНИЕ**: Приватные ключи отображаются в терминале. Используйте программу только в безопасном окружении.

## Поддерживаемые форматы

- **Taproot адреса**: bc1p... (P2TR)
- **Seed фразы**: 12/24 слова BIP39
- **Сеть**: Bitcoin Mainnet

## Примеры результатов

### Проверка балансов
```
===============================================
ПРОВЕРКА БАЛАНСОВ TAPROOT КОШЕЛЬКОВ
===============================================

Проверка seed 1/3:
  Проверка адреса 1/10: bc1p...
    ✅ БАЛАНС НАЙДЕН: 0.00123456 BTC
    📊 Транзакций: 5
    📈 Получено всего: 0.00200000 BTC
    🛑 ОСТАНОВКА ПРОВЕРКИ - БАЛАНС НАЙДЕН!

ИТОГОВЫЙ ОТЧЕТ
📊 Всего проверено адресов: 1
💰 Адресов с балансом: 1
🚀 ОБЩИЙ БАЛАНС: 0.00123456 BTC
```

### Генерация seed фраз
```
Генерация 5 seed фраз:

1. crime hurt filter tower purse must sure foster purpose brief subway culture
2. gesture solid moment outer napkin develop gate raise divorce egg hamster depend
3. stairs mercy tube outside country decide answer wisdom unfair biology screen menu
4. time fiction worry bunker alcohol family fatigue cousin popular donkey puzzle stand
5. olive distance physical point brick desert disease tent flat liberty sport diamond

💡 Эти seed фразы можно добавить в файл seeds.txt для проверки балансов
```
