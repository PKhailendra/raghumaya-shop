import { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useProductLookup, useUpdateProduct } from '../src/api/products';
import { useInvoiceBuilder } from '../src/store/invoiceBuilder';
import { LoadingSpinner } from '../src/components/LoadingSpinner';
import { Money } from '../src/components/Money';
import { ApiError } from '../src/api/client';
import { theme } from '../src/theme';

export default function ScanScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isInventoryMode = mode === 'inventory';
  const [permission, requestPermission] = useCameraPermissions();
  const [code, setCode] = useState('');
  const [scanned, setScanned] = useState(false);
  const [addQty, setAddQty] = useState('');
  const updateProduct = useUpdateProduct();

  const lookup = useProductLookup('barcode', code);
  const addItemFromProduct = useInvoiceBuilder((s) => s.addItemFromProduct);

  // External barcode database lookup (OpenFoodFacts) — only in inventory mode
  // when the product is not in own inventory
  const [extLoading, setExtLoading] = useState(false);
  const [extProduct, setExtProduct] = useState<{
    name?: string;
    brand?: string;
    quantity?: string;
    imageUrl?: string;
  } | null>(null);

  useEffect(() => {
    if (!isInventoryMode || !lookup.isError || !code) {
      setExtProduct(null);
      return;
    }
    let cancelled = false;
    setExtLoading(true);
    fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d?.status === 1 && d?.product) {
          const p = d.product;
          setExtProduct({
            name: p.product_name ?? p.product_name_en,
            brand: p.brands,
            quantity: p.quantity,
            imageUrl: p.image_url,
          });
        } else {
          setExtProduct(null);
        }
      })
      .catch(() => {
        if (!cancelled) setExtProduct(null);
      })
      .finally(() => {
        if (!cancelled) setExtLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isInventoryMode, lookup.isError, code]);

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
              <Text style={styles.subtitle}>No product found in your inventory.</Text>
              {isInventoryMode ? (
                extLoading ? (
                  <LoadingSpinner />
                ) : extProduct?.name ? (
                  <View style={styles.card}>
                    <Text style={styles.extLabel}>Found online — tap to use:</Text>
                    <Text style={styles.productName}>{extProduct.name}</Text>
                    {extProduct.brand ? <Text style={styles.meta}>Brand: {extProduct.brand}</Text> : null}
                    {extProduct.quantity ? <Text style={styles.meta}>Pack: {extProduct.quantity}</Text> : null}
                    <Text
                      style={[styles.button, styles.addToBill]}
                      onPress={() =>
                        router.push(
                          `/inventory/product-form?barcode=${encodeURIComponent(code)}&name=${encodeURIComponent(extProduct.name ?? '')}&brand=${encodeURIComponent(extProduct.brand ?? '')}`,
                        )
                      }
                    >
                      ✓ Use these details
                    </Text>
                    <Text
                      style={styles.button}
                      onPress={() => router.push(`/inventory/product-form?barcode=${encodeURIComponent(code)}`)}
                    >
                      + Create manually
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={[styles.button, styles.addToBill]}
                    onPress={() => router.push(`/inventory/product-form?barcode=${encodeURIComponent(code)}`)}
                  >
                    + Create new product
                  </Text>
                )
              ) : null}
              <Text style={styles.button} onPress={reset}>Scan again</Text>
            </View>
          ) : lookup.data ? (
            <View style={styles.card}>
              <Text style={styles.productName}>{lookup.data.name}</Text>
              <Text style={styles.meta}>{lookup.data.sku ?? 'No SKU'}</Text>
              <Money value={lookup.data.sellingPrice} style={styles.price} />
              <Text style={styles.meta}>Stock: {lookup.data.currentStock}</Text>
              {isInventoryMode ? (
                <>
                  <Text style={styles.label}>Add stock quantity</Text>
                  <TextInput
                    style={styles.qtyInput}
                    value={addQty}
                    onChangeText={setAddQty}
                    placeholder="e.g. 10"
                    placeholderTextColor={theme.colors.muted}
                    keyboardType="decimal-pad"
                  />
                  <Text
                    style={[styles.button, styles.addToBill]}
                    onPress={() => {
                      const qty = parseFloat(addQty);
                      if (Number.isNaN(qty) || qty <= 0) {
                        Alert.alert('Invalid quantity', 'Enter a valid quantity to add.');
                        return;
                      }
                      const p = lookup.data;
                      const newStock = (parseFloat(p.currentStock ?? '0') + qty).toFixed(3);
                      updateProduct.mutate(
                        { id: p.id, payload: { currentStock: newStock } },
                        {
                          onSuccess: () => {
                            Alert.alert('Stock updated ✓', `${p.name}: +${qty} (now ${newStock})`, [
                              { text: 'Scan more', style: 'cancel', onPress: () => { setAddQty(''); reset(); } },
                              { text: 'Done', onPress: () => router.back() },
                            ]);
                          },
                          onError: (e) => {
                            Alert.alert('Failed', e instanceof ApiError ? e.message : 'Could not update stock.');
                          },
                        },
                      );
                    }}
                  >
                    {updateProduct.isPending ? 'Updating…' : '+ Add Stock'}
                  </Text>
                </>
              ) : (
                <>
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
                </>
              )}
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
  label: { fontSize: 13, fontWeight: '600', color: theme.colors.subtext, marginTop: 12, marginBottom: 6 },
  qtyInput: { backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, padding: 12, fontSize: 16, color: theme.colors.text },
  extLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.success, marginBottom: 8 },
});
