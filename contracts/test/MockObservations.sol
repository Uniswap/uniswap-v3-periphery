// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.7.6;

contract MockObservations {
    uint32[4] internal blockTimestamps;
    int56[4] internal tickCumulatives;
    bool[4] internal initializeds;
    int24 slot0Tick;
    uint16 internal slot0ObservationCardinality;
    uint16 internal slot0ObservationIndex;

    bool internal lastObservationCurrentTimestamp;

    constructor(
        uint32[4] memory _blockTimestamps,
        int56[4] memory _tickCumulatives,
        bool[4] memory _initializeds,
        int24 _tick,
        uint16 _observationCardinality,
        uint16 _observationIndex,
        bool _lastObservationCurrentTimestamp
    ) {
        for (uint256 i = 0; i < _blockTimestamps.length; i++) {
            blockTimestamps[i] = _blockTimestamps[i];
            tickCumulatives[i] = _tickCumulatives[i];
            initializeds[i] = _initializeds[i];
        }

        slot0Tick = _tick;
        slot0ObservationCardinality = _observationCardinality;
        slot0ObservationIndex = _observationIndex;
        lastObservationCurrentTimestamp = _lastObservationCurrentTimestamp;
    }

    function slot0()
        external
        view
        returns (
            uint160,
            int24,
            uint16,
            uint16,
            uint16,
            uint8,
            bool
        )
    {
        return (0, slot0Tick, slot0ObservationIndex, slot0ObservationCardinality, 0, 0, false);
    }

    function observations(uint256 index)
        external
        view
        returns (
            uint32,
            int56,
            uint160,
            bool
        )
    {
        uint32 observationTimestamp =
            lastObservationCurrentTimestamp
                ? uint32(block.timestamp) - (blockTimestamps[slot0ObservationIndex] - blockTimestamps[index])
                : blockTimestamps[index];
        return (observationTimestamp, tickCumulatives[index], 0, initializeds[index]);
    }
}
