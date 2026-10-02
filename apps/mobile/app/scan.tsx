import { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useProductLookup } from '../src/api/products';
import { useInvoiceBuilder } from '../src/store/invoiceBuilder';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { Money } from '../src/components/Money';
import { theme } from '../src/theme';

export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState('');
  const [scanned, setScanned] = useState(false);

  const lookup = useProductLookup('barcode', code);
  const addItemFromProduct = useInvoiceBuilder((s) => s.addItemFromProduct);

  if (!permission) return <LoadingSpinner />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.subtitle}>Allow camera access to scan product barcodes.</Text>
        <Text style={styles.button} onPress={() => requestPermission()}>Grant permission</Text>
      </View>
    );
  }

  const handleScan = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    setCode(data);
  };

  const reset = () => {
    setScanned(false);
    setCode('');
  };

  return (
    <View style={styles.container}>
      {!scanned ? (
        <View style={styles.camera}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'] }}
            onBarcodeScanned={handleScan}
          />
          <View style={styles.overlay} pointerEvents="none">
            <Text style={styles.overlayText}>Point the camera at a barcode</Text>
          </View>
        </View>
      ) : (
        <View style={styles.result}>
          <Text style={styles.title}>Scanned code</Text>
          <Text style={styles.code}>{code}</Text>
          {lookup.isLoading ? (
            <LoadingSpinner />
          ) : lookup.isError ? (
            <View style={styles.center}>
              <Text style={styles.subtitle}>No product found for this barcode.</Text>
              <Text style={styles.button} onPress={reset}>Scan again</Text>
            </View>
          ) : lookup.data ? (
            <View style={styles.card}>
              <Text style={styles.productName}>{lookup.data.name}</Text>
              <Text style={styles.meta}>{lookup.data.sku ?? 'No SKU'}</Text>
              <Money value={lookup.data.sellingPrice} style={styles.price} />
              <Text style={styles.meta}>Stock: {lookup.data.currentStock}</Text>
              <Text
                style={[styles.button, styles.addToBill]}
                onPress={() => {
                  const p = lookup.data;
                  addItemFromProduct(p);
                  Alert.alert('Added ✓', `${p.name} added to the bill. Scan next item or go to bill.`, [
                    { text: 'Scan more', style: 'cancel', onPress: reset },
                    { text: 'Go to Bill', onPress: () => router.push('/billing/new') },
                  ]);
                }}
              >
                Add to Bill
              </Text>
              <Text style={styles.button} onPress={() => router.push('/billing/new')}>Go to Bill</Text>
              <Text style={[styles.button, styles.secondary]} onPress={reset}>Scan again</Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 64 },
  overlayText: { color: '#fff', fontSize: 16, fontWeight: '600', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  result: { flex: 1, backgroundColor: theme.colors.background, padding: 24, paddingTop: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: theme.colors.background },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text },
  subtitle: { fontSize: 14, color: theme.colors.subtext, marginTop: 8, textAlign: 'center' },
  code: { fontSize: 16, fontWeight: '600', color: theme.colors.primary, marginTop: 8 },
  card: { backgroundColor: theme.colors.card, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: 16, marginTop: 16 },
  productName: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  meta: { fontSize: 13, color: theme.colors.subtext, marginTop: 4 },
  price: { fontSize: 20, fontWeight: '800', color: theme.colors.success, marginTop: 8 },
  button: { marginTop: 16, backgroundColor: theme.colors.primary, borderRadius: theme.radius.sm, paddingVertical: 12, paddingHorizontal: 24, color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center', overflow: 'hidden' },
  addToBill: { backgroundColor: theme.colors.success },
  secondary: { backgroundColor: theme.colors.mutedBg, color: theme.colors.text },
});
