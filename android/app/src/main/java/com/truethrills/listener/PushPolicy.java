package com.truethrills.listener;

/**
 * Решения об уведомлениях, вынесенные из моста: здесь нет ни одного импорта
 * Android, поэтому их можно проверить обычным javac без эмулятора и SDK
 * (tests/android-push-logic.mjs).
 */
final class PushPolicy {
    private PushPolicy() {}

    /** Языки, на которых сервер умеет писать уведомления (lib/i18n/index.ts). */
    static final String[] LOCALES = {"ru", "it", "uk", "ro"};
    static final String DEFAULT_LOCALE = "ru";

    /**
     * Язык телефона приводится к одному из четырёх наших. Сравниваем по
     * базовому языку, чтобы it-CH считался итальянским, а ro-MD — румынским;
     * «mo» — снятый с учёта код молдавского, словарь у них общий с румынским.
     * Раньше здесь было «it или ru», и украинец с румыном получали пуши
     * по-русски, хотя весь остальной интерфейс у них на своём языке.
     */
    static String locale(String tag) {
        if (tag == null) return DEFAULT_LOCALE;
        String base = tag.trim().toLowerCase(java.util.Locale.ROOT);
        int cut = base.indexOf('-'); if (cut > 0) base = base.substring(0, cut);
        cut = base.indexOf('_'); if (cut > 0) base = base.substring(0, cut);
        for (String known : LOCALES) if (known.equals(base)) return known;
        if (base.equals("mo") || base.equals("mol") || base.equals("ron") || base.equals("rum")) return "ro";
        if (base.equals("ukr")) return "uk";
        if (base.equals("ita")) return "it";
        return DEFAULT_LOCALE;
    }

    /**
     * Автоматическое включение после «Разрешить» в системном диалоге.
     *
     * Раньше отметка «уже пробовали» ставилась до попытки, и первый же запуск
     * без сети (а первый запуск — это как раз установка, часто по мобильному
     * интернету в метро) навсегда закрывал автоподписку: разрешение выдано, а
     * уведомлений нет и не будет, пока слушатель сам не найдёт кнопку.
     * Теперь отметка ставится только после удачной подписки, поэтому неудача
     * — временная и повторяется при следующем открытии приложения.
     *
     * @param permitted    системное разрешение выдано
     * @param alreadyDone  подписка уже была успешно выполнена автоматически
     * @param subscribed   устройство уже зарегистрировано на сервере
     * @param userDisabled слушатель сам выключил уведомления
     */
    static boolean shouldAutoEnable(boolean permitted, boolean alreadyDone, boolean subscribed, boolean userDisabled) {
        return permitted && !alreadyDone && !subscribed && !userDisabled;
    }

    /**
     * Уже зарегистрированные устройства переезжают на свой язык без участия
     * слушателя: если телефон говорит по-украински, а на сервере записан
     * русский, подписку нужно обновить. Заодно это чинит устройства, которые
     * регистрировались старой сборкой.
     */
    static boolean shouldRefreshLocale(String stored, String deviceTag) {
        return !locale(deviceTag).equals(stored == null ? "" : stored);
    }
}
