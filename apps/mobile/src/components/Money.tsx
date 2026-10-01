import { Text, StyleSheet, TextStyle } from 'react-native';
import { formatINR } from '../utils/format';

export function Money(props: { value: string | number; style?: TextStyle | TextStyle[] }) {
  return <Text style={[styles.text, props.style]}>{formatINR(props.value)}</Text>;
}

const styles = StyleSheet.create({
  text: { fontVariant: ['tabular-nums'] },
});
