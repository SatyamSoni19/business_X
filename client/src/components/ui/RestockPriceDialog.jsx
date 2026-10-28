import { useState, useCallback } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { inr } from '../../lib/format';

function avgPrice(oldPrice, newPrice, isLoose) {
    const avg = (oldPrice + newPrice) / 2;
    return isLoose ? Math.round(avg * 100) / 100 : Math.round(avg);
}

function RestockItemCard({ info, choice, onChange }) {
    const {
        itemName, itemType,
        oldPurchasePrice, oldSellingPrice, oldMrp, oldQty,
        newPurchasePrice, newSellingPrice, newMrp, newQty,
    } = info;

    const isLoose = itemType === 'loose';
    const avg = avgPrice(oldSellingPrice, newSellingPrice, isLoose);
    const [customPrice, setCustomPrice] = useState('');
    const selectedOption = choice.option;

    const effectivePrice =
        selectedOption === 'keep' ? oldSellingPrice :
        selectedOption === 'new' ? newSellingPrice :
        selectedOption === 'avg' ? avg :
        Number(customPrice) || 0;

    const belowCost = effectivePrice > 0 && effectivePrice < newPurchasePrice;
    const aboveMrp = newMrp && effectivePrice > newMrp && itemType !== 'loose';

    return (
        <div className="rounded-xl border-2 border-slate-900 bg-white p-4 mb-4">
            <h4 className="text-sm font-black mb-2">{itemName}</h4>

            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                <div className="rounded-lg border-2 border-slate-300 p-3">
                    <div className="text-xs font-bold text-slate-500 uppercase mb-1">Old stock</div>
                    <div className="font-semibold">Bought {inr(oldPurchasePrice)}</div>
                    <div className="font-semibold">Sells {inr(oldSellingPrice)}</div>
                    <div className="font-semibold">{oldQty} left</div>
                </div>
                <div className="rounded-lg border-2 border-slate-300 p-3">
                    <div className="text-xs font-bold text-slate-500 uppercase mb-1">New stock</div>
                    <div className="font-semibold">Bought {inr(newPurchasePrice)}</div>
                    <div className="font-semibold">Sells {inr(newSellingPrice ?? oldSellingPrice)}</div>
                    <div className="font-semibold">{newQty} added</div>
                </div>
            </div>

            <p className="text-sm font-medium text-slate-600 mb-4">
                The {oldQty} old units still count as {inr(oldPurchasePrice)} cost and the {newQty} new ones as {inr(newPurchasePrice)}, so your profit stays correct.
            </p>

            <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="radio"
                        name={`price-${info.itemId}`}
                        checked={selectedOption === 'keep'}
                        onChange={() => onChange({ option: 'keep', price: oldSellingPrice })}
                        className="accent-slate-900"
                    />
                    <span className="text-sm font-semibold">Keep old selling price ({inr(oldSellingPrice)})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="radio"
                        name={`price-${info.itemId}`}
                        checked={selectedOption === 'new'}
                        onChange={() => onChange({ option: 'new', price: newSellingPrice })}
                        className="accent-slate-900"
                    />
                    <span className="text-sm font-semibold">Use new selling price ({inr(newSellingPrice)})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="radio"
                        name={`price-${info.itemId}`}
                        checked={selectedOption === 'avg'}
                        onChange={() => onChange({ option: 'avg', price: avg })}
                        className="accent-slate-900"
                    />
                    <span className="text-sm font-semibold">Average of old and new ({inr(avg)})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="radio"
                        name={`price-${info.itemId}`}
                        checked={selectedOption === 'custom'}
                        onChange={() => onChange({ option: 'custom', price: Number(customPrice) || 0 })}
                        className="accent-slate-900"
                    />
                    <span className="text-sm font-semibold">Custom price</span>
                    <input
                        type="number"
                        min="0"
                        step="any"
                        value={customPrice}
                        onChange={(e) => {
                            setCustomPrice(e.target.value);
                            if (selectedOption === 'custom') {
                                onChange({ option: 'custom', price: Number(e.target.value) || 0 });
                            }
                        }}
                        onFocus={() => onChange({ option: 'custom', price: Number(customPrice) || 0 })}
                        placeholder="₹"
                        className="h-9 w-24 rounded-md border-2 border-slate-900 bg-white px-2 text-sm font-semibold outline-none focus:ring-4 focus:ring-slate-900/15"
                    />
                </label>
            </div>

            {belowCost && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border-2 border-amber-600 bg-amber-50 px-3 py-2">
                    <Badge tone="warn">Warning</Badge>
                    <span className="text-sm font-semibold text-amber-900">Selling price is below the new purchase cost ({inr(newPurchasePrice)})</span>
                </div>
            )}
            {aboveMrp && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border-2 border-amber-600 bg-amber-50 px-3 py-2">
                    <Badge tone="warn">Warning</Badge>
                    <span className="text-sm font-semibold text-amber-900">Selling price is above the new MRP ({inr(newMrp)})</span>
                </div>
            )}
        </div>
    );
}

/**
 * Restock Price Dialog — shown when a restock changes purchase price or selling price.
 *
 * Props:
 *   open: boolean
 *   restockInfo: Array of { itemId, itemName, itemType, oldPurchasePrice, oldSellingPrice, oldMrp, oldQty, newPurchasePrice, newSellingPrice, newMrp, newQty }
 *   onConfirm: (decisions: Map<itemId, sellingPrice>) => void
 *   onClose: () => void
 */
export default function RestockPriceDialog({ open, restockInfo = [], onConfirm, onClose }) {
    const [choices, setChoices] = useState(() => {
        const map = {};
        for (const info of restockInfo) {
            const hasNewSelling = info.newSellingPrice !== info.oldSellingPrice;
            map[info.itemId] = hasNewSelling
                ? { option: 'new', price: info.newSellingPrice }
                : { option: 'keep', price: info.oldSellingPrice };
        }
        return map;
    });

    // Reset when dialog opens with new data
    const setChoice = useCallback((itemId, choice) => {
        setChoices(prev => ({ ...prev, [itemId]: choice }));
    }, []);

    function applyToAll(option) {
        const next = {};
        for (const info of restockInfo) {
            const avg = avgPrice(info.oldSellingPrice, info.newSellingPrice, info.itemType === 'loose');
            next[info.itemId] = {
                option,
                price: option === 'keep' ? info.oldSellingPrice :
                       option === 'new' ? info.newSellingPrice :
                       avg,
            };
        }
        setChoices(next);
    }

    function handleConfirm() {
        const decisions = new Map();
        for (const info of restockInfo) {
            const choice = choices[info.itemId];
            if (choice) {
                decisions.set(info.itemId, choice.price);
            }
        }
        onConfirm(decisions);
    }

    if (!restockInfo.length) return null;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Restock price change"
            size="lg"
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleConfirm}>Confirm &amp; save</Button>
                </>
            }
        >
            {restockInfo.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 mb-4 rounded-lg border-2 border-slate-300 bg-slate-50 p-3">
                    <span className="text-sm font-bold">Apply to all:</span>
                    <Button size="sm" variant="secondary" onClick={() => applyToAll('new')}>Use new</Button>
                    <Button size="sm" variant="secondary" onClick={() => applyToAll('keep')}>Keep old</Button>
                    <Button size="sm" variant="secondary" onClick={() => applyToAll('avg')}>Average</Button>
                </div>
            )}

            {restockInfo.map(info => (
                <RestockItemCard
                    key={info.itemId}
                    info={info}
                    choice={choices[info.itemId] || { option: 'keep', price: info.oldSellingPrice }}
                    onChange={(c) => setChoice(info.itemId, c)}
                />
            ))}
        </Modal>
    );
}

