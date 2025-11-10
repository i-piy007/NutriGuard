import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';

export default function RawIngredientsEntry() {
	useEffect(() => {
		// Redirect to camera with proper mode when hitting this route directly
		router.replace({ pathname: '/camera', params: { mode: 'raw_ingredients' } });
	}, []);

	return (
		<View style={styles.container}>
			<ActivityIndicator />
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

