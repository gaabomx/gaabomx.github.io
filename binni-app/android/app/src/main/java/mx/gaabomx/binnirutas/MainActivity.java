package mx.gaabomx.binnirutas;

import android.graphics.Color;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Pantalla de borde a borde (Android 15+). Barras transparentes con iconos claros;
        // Capacitor deja la página fuera de las barras (adjustMarginsForEdgeToEdge).
        EdgeToEdge.enable(this,
            SystemBarStyle.dark(Color.TRANSPARENT),
            SystemBarStyle.dark(Color.TRANSPARENT));
        super.onCreate(savedInstanceState);
    }
}
