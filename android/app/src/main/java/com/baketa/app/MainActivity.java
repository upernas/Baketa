package com.baketa.app;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Actividad única de Baketa.
 *
 * 1) Áreas seguras: desde Android 15 las apps que apuntan a API 35+ se dibujan
 *    debajo de las barras del sistema (edge-to-edge) y en Android 16 ya no se
 *    puede desactivar. Se aplican como relleno los márgenes de las barras y del
 *    recorte de pantalla para que la barra de transporte y las pestañas no
 *    queden tapadas, con gestos o con botones de navegación.
 *
 * 2) Botón atrás: se delega en la app web (window.baketaHandleBack), que cierra
 *    el diálogo abierto o vuelve a la pestaña del metrónomo. Si no hay nada que
 *    hacer, se cierra la actividad. En API 36 el sistema ya no llama a
 *    onBackPressed(), por eso se usa OnBackPressedDispatcher.
 *
 * No se añade ningún permiso ni servicio: la app no usa red, sensores ni
 * almacenamiento del sistema.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final View root = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView == null) {
                    finish();
                    return;
                }
                webView.evaluateJavascript(
                    "(typeof window.baketaHandleBack === 'function') ? window.baketaHandleBack() : false",
                    value -> {
                        if (!"true".equals(value)) {
                            finish();
                        }
                    }
                );
            }
        });
    }
}
