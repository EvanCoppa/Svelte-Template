import type { Presentation } from './types';

/**
 * A stand-in presentation for the builder, so a slide previews the way it
 * will present — a per-option slide shows three options, a bound heading
 * shows a name — without a proposal picked. The words for the two people
 * come from the org's vocabulary; everything else is fiction.
 */
export function samplePresentation(
	org: { name: string },
	noun: string,
	labels: Presentation['labels']
): Presentation {
	return {
		org,
		proposal: {
			id: 'sample',
			title: 'Jordan Rivera',
			noun,
			date: new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date()),
			validUntil: null
		},
		client: { name: 'Jordan Rivera' },
		presenter: { name: 'Sam Taylor' },
		responsible: { name: 'Dr. Casey Morgan' },
		labels,
		options: [
			{
				id: 'sample-1',
				label: 'Essential',
				recommended: false,
				total: 4200,
				currency: 'USD',
				duration: '6 months',
				financing: null,
				lines: [
					{
						label: 'Consultation',
						detail: null,
						quantity: 1,
						unitCost: 200,
						total: 200,
						productId: null
					},
					{
						label: 'Core service',
						detail: '12, 13',
						quantity: 2,
						unitCost: 2000,
						total: 4000,
						productId: null
					}
				],
				fields: [
					{ label: 'Warranty', value: '2 years' },
					{ label: 'Includes onboarding', value: 'No' }
				]
			},
			{
				id: 'sample-2',
				label: 'Complete',
				recommended: true,
				total: 7900,
				currency: 'USD',
				duration: '4 months',
				financing: '12 months at 0% APR',
				lines: [
					{
						label: 'Consultation',
						detail: null,
						quantity: 1,
						unitCost: 200,
						total: 200,
						productId: null
					},
					{
						label: 'Core service',
						detail: '12, 13',
						quantity: 2,
						unitCost: 2000,
						total: 4000,
						productId: null
					},
					{
						label: 'Premium finish',
						detail: 'Upper',
						quantity: 1,
						unitCost: 3700,
						total: 3700,
						productId: null
					}
				],
				fields: [
					{ label: 'Warranty', value: '5 years' },
					{ label: 'Includes onboarding', value: 'Yes' }
				]
			},
			{
				id: 'sample-3',
				label: 'Premium',
				recommended: false,
				total: 12400,
				currency: 'USD',
				duration: '3 months',
				financing: '24 months at 4.99% APR',
				lines: [
					{
						label: 'Consultation',
						detail: null,
						quantity: 1,
						unitCost: 200,
						total: 200,
						productId: null
					},
					{
						label: 'Core service',
						detail: '12, 13',
						quantity: 2,
						unitCost: 2000,
						total: 4000,
						productId: null
					},
					{
						label: 'Premium finish',
						detail: 'Upper, Lower',
						quantity: 2,
						unitCost: 3700,
						total: 7400,
						productId: null
					},
					{
						label: 'Aftercare kit',
						detail: null,
						quantity: 1,
						unitCost: 800,
						total: 800,
						productId: 'sample-kit'
					}
				],
				fields: [
					{ label: 'Warranty', value: 'Lifetime' },
					{ label: 'Includes onboarding', value: 'Yes' }
				]
			}
		],
		products: [
			{
				id: 'sample-kit',
				sku: 'KIT-1',
				name: 'Aftercare kit',
				description: 'Everything needed to look after the result at home.',
				price: 800,
				currency: 'USD'
			},
			{
				id: 'sample-guard',
				sku: 'GUARD-1',
				name: 'Night guard',
				description: 'Custom fitted, made in our own lab.',
				price: 450,
				currency: 'USD'
			},
			{
				id: 'sample-whitening',
				sku: 'WHITE-1',
				name: 'Whitening refill',
				description: 'A three-month supply of take-home gel.',
				price: 120,
				currency: 'USD'
			}
		]
	};
}
