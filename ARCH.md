ARCH.md: Архитектура Solana Stablecoin Standard (SSS)
1. Обзор системы
Цель проекта — создание модульного SDK и стандарта для стейблкоинов на Solana, использующего расширения Token-2022. Система разделена на три уровня: базовый SDK, модули (комплаенс, приватность) и готовые пресеты (SSS-1 и SSS-2).
+3

2. Логика PDA (Program Derived Addresses)
Программа использует систему PDA для управления состоянием и правами доступа без единой точки отказа (RBAC).

Global Config PDA:

Seeds: [b"config", mint_account.key()]


Назначение: Хранит основные параметры стейблкоина (название, флаги модулей, мастер-авторитет).
+1

Minter Stats PDA:

Seeds: [b"minter", config.key(), minter_address.key()]


Назначение: Хранит квоты на чеканку для конкретных адресов.

Blacklist Entry PDA (SSS-2):

Seeds: [b"blacklist", config.key(), user_address.key()]


Назначение: Маркер заблокированного адреса для проверки через Transfer Hook.
+2

3. Структуры аккаунтов (Account Structures)
3.1. StablecoinConfig
Основной управляющий аккаунт, определяющий поведение токена.
+1

Rust

#[account]
pub struct StablecoinConfig {
    pub master_authority: Pubkey, // Главный ключ управления ролями
    pub name: String,             // 
    pub symbol: String,           // 
    pub uri: String,              // 
    pub decimals: u8,             // 
    pub paused: bool,             // Флаг глобальной остановки 
    
    // Флаги пресетов и модулей 
    pub enable_permanent_delegate: bool, // Для SSS-2 (seize)
    pub enable_transfer_hook: bool,      // Для SSS-2 (blacklist)
    pub default_account_frozen: bool,    // Для управляемых систем
    
    // Роли (RBAC) 
    pub blacklister: Pubkey,
    pub pauser: Pubkey,
    pub seizer: Pubkey,
}
3.2. MinterInfo
Аккаунт для управления квотами чеканки.
+1

Rust

#[account]
pub struct MinterInfo {
    pub authority: Pubkey,
    pub quota: u64,       // Максимально допустимый объем чеканки
    pub minted: u64,      // Уже отчеканено
}
4. Набор инструкций (Instruction Set)
4.1. 
Основные инструкции (Все пресеты) 

Initialize: Создает Mint-аккаунт с расширениями Token-2022 (Metadata, Freeze Authority).


Mint/Burn: Выпуск и сжигание токенов с проверкой квот через MinterInfo.


Freeze/Thaw: Блокировка/разблокировка конкретных токен-аккаунтов.
+2


Pause/Unpause: Глобальная остановка всех операций с токеном.
+2


UpdateRoles: Передача прав (minter, blacklister и т.д.).
+1

4.2. 
Инструкции SSS-2 (Compliant Stablecoin) 
AddToBlacklist / RemoveFromBlacklist: Создание или удаление PDA BlacklistEntry. Должны выдавать ошибку, если модуль комплаенса не включен.


Seize: Использование PermanentDelegate для принудительного перевода токенов с замороженного аккаунта на казначейский.

5. Модуль Transfer Hook (SSS-2)
Отдельная программа, которая вызывается при каждом переводе токенов.
+1

Логика: Проверяет наличие BlacklistEntry PDA для отправителя и получателя. Если хотя бы один адрес в черном списке, транзакция отклоняется.
+1

6. Безопасность и RBAC 

Принцип наименьших привилегий: Мастер-ключ только назначает роли. Операционные ключи (minter, blacklister) имеют узкий функционал.

Graceful Failure: Инструкции seize или blacklist проверяют флаги в StablecoinConfig. Если enable_transfer_hook == false, транзакция должна быть отклонена с кастомной ошибкой.

Ресурсы для реализации:


Эталон: Solana Vault Standard (SVS) для структуры кода.
+1


Token-2022: Документация по Permanent Delegate и Transfer Hook.


Тестирование: Интеграционные тесты для SSS-1 (mint/freeze) и SSS-2 (blacklist/seize).