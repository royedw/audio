/**
 * 频谱图插件
 *
 * 渲染音频的可视化频谱图
 *
 * @author Pavel Denisov (https://github.com/akreal)
 * @see https://github.com/wavesurfer-js/wavesurfer.js/pull/337
 *
 * @example
 * // ... 通过这个插件初始化 waveform
 * var waveform = WaveForm.create({
 *   // waveform options ...
 *   plugins: [
 *     SpectrogramPlugin.create({
 *       // plugin options ...
 *     })
 *   ]
 * });
 */

// @ts-nocheck

/**
 * Calculate FFT - Based on https://github.com/corbanbrook/dsp.js 傅里叶变换
 */
function FFT(bufferSize: number, sampleRate: number, windowFunc: string, alpha: number) {
    this.bufferSize = bufferSize
    this.sampleRate = sampleRate
    this.bandwidth = (2 / bufferSize) * (sampleRate / 2)

    this.sinTable = new Float32Array(bufferSize)
    this.cosTable = new Float32Array(bufferSize)
    this.windowValues = new Float32Array(bufferSize)
    this.reverseTable = new Uint32Array(bufferSize)

    this.peakBand = 0
    this.peak = 0

    var i
    switch (windowFunc) {
        case 'bartlett':
            for (i = 0; i < bufferSize; ++i) {
                this.windowValues[i] = (2 / (bufferSize - 1)) * ((bufferSize - 1) / 2 - Math.abs(i - (bufferSize - 1) / 2))
            }
            break
        case 'bartlettHann':
            for (i = 0; i < bufferSize; ++i) {
                this.windowValues[i] =
                    0.62 - 0.48 * Math.abs(i / (bufferSize - 1) - 0.5) - 0.38 * Math.cos((Math.PI * 2 * i) / (bufferSize - 1))
            }
            break
        case 'blackman':
            alpha = alpha || 0.16
            for (i = 0; i < bufferSize; ++i) {
                this.windowValues[i] =
                    (1 - alpha) / 2 -
                    0.5 * Math.cos((Math.PI * 2 * i) / (bufferSize - 1)) +
                    (alpha / 2) * Math.cos((4 * Math.PI * i) / (bufferSize - 1))
            }
            break
        case 'cosine':
            for (i = 0; i < bufferSize; ++i) {
                this.windowValues[i] = Math.cos((Math.PI * i) / (bufferSize - 1) - Math.PI / 2)
            }
            break
        case 'gauss':
            alpha = alpha || 0.25
            for (i = 0; i < bufferSize; ++i) {
                this.windowValues[i] = Math.pow(
                    Math.E,
                    -0.5 * Math.pow((i - (bufferSize - 1) / 2) / ((alpha * (bufferSize - 1)) / 2), 2)
                )
            }
            break
        case 'hamming':
            for (i = 0; i < bufferSize; ++i) {
                this.windowValues[i] = 0.54 - 0.46 * Math.cos((Math.PI * 2 * i) / (bufferSize - 1))
            }
            break
        case 'hann':
        case undefined:
            for (i = 0; i < bufferSize; ++i) {
                this.windowValues[i] = 0.5 * (1 - Math.cos((Math.PI * 2 * i) / (bufferSize - 1)))
            }
            break
        case 'lanczoz':
            for (i = 0; i < bufferSize; ++i) {
                this.windowValues[i] =
                    Math.sin(Math.PI * ((2 * i) / (bufferSize - 1) - 1)) / (Math.PI * ((2 * i) / (bufferSize - 1) - 1))
            }
            break
        case 'rectangular':
            for (i = 0; i < bufferSize; ++i) {
                this.windowValues[i] = 1
            }
            break
        case 'triangular':
            for (i = 0; i < bufferSize; ++i) {
                this.windowValues[i] = (2 / bufferSize) * (bufferSize / 2 - Math.abs(i - (bufferSize - 1) / 2))
            }
            break
        default:
            throw Error("No such window function '" + windowFunc + "'")
    }

    var limit = 1
    var bit = bufferSize >> 1
    var i

    while (limit < bufferSize) {
        for (i = 0; i < limit; ++i) {
            this.reverseTable[i + limit] = this.reverseTable[i] + bit
        }

        limit = limit << 1
        bit = bit >> 1
    }

    for (i = 0; i < bufferSize; ++i) {
        this.sinTable[i] = Math.sin(-Math.PI / i)
        this.cosTable[i] = Math.cos(-Math.PI / i)
    }

    this.calculateSpectrum = function (buffer) {
        // 用于加速计算的局部范围变量
        var bufferSize = this.bufferSize,
            cosTable = this.cosTable,
            sinTable = this.sinTable,
            reverseTable = this.reverseTable,
            real = new Float32Array(bufferSize),
            imag = new Float32Array(bufferSize),
            bSi = 2 / this.bufferSize,
            sqrt = Math.sqrt,
            rval,
            ival,
            mag,
            spectrum = new Float32Array(bufferSize / 2)

        var k = Math.floor(Math.log(bufferSize) / Math.LN2)

        if (Math.pow(2, k) !== bufferSize) {
            throw 'Invalid buffer size, must be a power of 2.'
        }
        if (bufferSize !== buffer.length) {
            throw (
                'Supplied buffer is not the same size as defined FFT. FFT Size: ' +
                bufferSize +
                ' Buffer Size: ' +
                buffer.length
            )
        }

        var halfSize = 1,
            phaseShiftStepReal,
            phaseShiftStepImag,
            currentPhaseShiftReal,
            currentPhaseShiftImag,
            off,
            tr,
            ti,
            tmpReal

        for (var i = 0; i < bufferSize; ++i) {
            real[i] = buffer[reverseTable[i]] * this.windowValues[reverseTable[i]]
            imag[i] = 0
        }

        while (halfSize < bufferSize) {
            phaseShiftStepReal = cosTable[halfSize]
            phaseShiftStepImag = sinTable[halfSize]

            currentPhaseShiftReal = 1
            currentPhaseShiftImag = 0

            for (var fftStep = 0; fftStep < halfSize; ++fftStep) {
                var i = fftStep

                while (i < bufferSize) {
                    off = i + halfSize
                    tr = currentPhaseShiftReal * real[off] - currentPhaseShiftImag * imag[off]
                    ti = currentPhaseShiftReal * imag[off] + currentPhaseShiftImag * real[off]

                    real[off] = real[i] - tr
                    imag[off] = imag[i] - ti
                    real[i] += tr
                    imag[i] += ti

                    i += halfSize << 1
                }

                tmpReal = currentPhaseShiftReal
                currentPhaseShiftReal = tmpReal * phaseShiftStepReal - currentPhaseShiftImag * phaseShiftStepImag
                currentPhaseShiftImag = tmpReal * phaseShiftStepImag + currentPhaseShiftImag * phaseShiftStepReal
            }

            halfSize = halfSize << 1
        }

        for (var i = 0, N = bufferSize / 2; i < N; ++i) {
            rval = real[i]
            ival = imag[i]
            mag = bSi * sqrt(rval * rval + ival * ival)

            if (mag > this.peak) {
                this.peakBand = i
                this.peak = mag
            }
            spectrum[i] = mag
        }
        return spectrum
    }
}

/** 
 * waveform 的频谱图插件
 */
import BasePlugin, { type BasePluginEvents } from "../base-plugin"
import render from "../dom"

export type SpectrogramPluginOptions = {
    /** HTML 元素或要渲染的元素选择器 */
    container?: string | HTMLElement
    /** 傅里叶变换（FFT）采样长度，必须是 2 的幂 */
    fftSamples?: number
    /** 频谱图视图的高度（以 css 像素为单位） */
    height?: number
    /** 设置为 true 可显示频率标签 */
    labels?: boolean
    labelsBackground?: string
    labelsColor?: string
    labelsHzColor?: string
    /** 重叠窗口的大小，必须小于 fftSamples，默认从画布大小自动推断 */
    noverlap?: number
    /** 要使用的窗口函数 */
    windowFunc?:
    | 'bartlett'
    | 'bartlettHann'
    | 'blackman'
    | 'cosine'
    | 'gauss'
    | 'hamming'
    | 'hann'
    | 'lanczoz'
    | 'rectangular'
    | 'triangular'
    /** 部分窗口函数有这个额外的参数（ 0 - 1 之间） */
    alpha?: number
    /** 频谱图刻度的最小频率 */
    frequencyMin?: number
    /** 频谱图刻度的最大频率，将其设置为 samplerate/2 以绘制频谱图的整个范围 */
    frequencyMax?: number
    /** 
     * 一个长为 256 的 4 元素数组
     * 每条都应该包含一个 0 - 1 之间的浮点数，且指定 r、g、b 和 alpha
     */
    colorMap?: number[][]
    /** 为 true 时，为每个通道独立渲染一个频谱图 */
    splitChannels?: boolean
}

export type SpectrogramPluginEvents = BasePluginEvents & {
    ready: []
    click: [relativeX: number]
}

class SpectrogramPlugin extends BasePlugin<SpectrogramPluginEvents, SpectrogramPluginOptions>{
    static create(options?: SpectrogramPluginOptions) {
        return new SpectrogramPlugin(options || {})
    }

    constructor(options: SpectrogramPluginOptions) {
        super(options)

        this.frequenciesDataUrl = options.frequenciesDataUrl

        this.container =
            'string' == typeof options.container ? document.querySelector(options.container) : options.container

        if (options.colorMap) {
            if (options.colorMap.length < 256) {
                throw new Error('Colormap must contain 256 elements!')
            }
            for (let i = 0; i < options.colorMap.length; ++i) {
                const cmEntry = options.colorMap[i]
                if (cmEntry.length !== 4) {
                    throw new Error('Colormap entries must contain 4 values!')
                }
            }
            this.colorMap = options.colorMap
        } else {
            this.colorMap = []
            for (let i = 0; i < 256; ++i) {
                const val = (255 - i) / 256
                this.colorMap.push([val, val, val, 1])
            }
        }
        this.fftSamples = options.fftSamples || 512
        this.height = options.height || this.fftSamples / 2
        this.noverlap = options.noverlap
        this.windowFunc = options.windowFunc
        this.alpha = options.alpha

        // 获取文件的原始采样率很困难
        // 所以默认设置 12kHz 渲染
        this.frequencyMin = options.frequencyMin || 0
        this.frequencyMax = options.frequencyMax || 0

        this.createWrapper()
        this.createCanvas()
    }

    onInit() {
        this.container = this.container || this.waveform.getWrapper()
        this.container.appendChild(this.wrapper)

        if (this.waveform.options.fillParent) {
            Object.assign(this.wrapper.style, {
                width: '100%',
                overflowX: 'hidden',
                overflowY: 'hidden',
            })
        }
        this.subscriptions.push(this.waveform.on('redraw', () => this.render()))
    }

    public destroy() {
        this.unAll()
        this.waveform.un('ready', this._onReady)
        this.waveform?.un('redraw', this._onRender)
        this.waveform = null
        this.util = null
        this.options = null
        if (this.wrapper) {
            this.wrapper.remove()
            this.wrapper = null
        }
        super.destroy()
    }

    public async loadFrequenciesData(url: string | URL) {
        const resp = await fetch(url)
        if (!resp.ok) {
            throw new Error('Unable to fetch frequencies data!')
        }
        const data = await resp.json()
        this.drawSpectrogram(data)
    }

    private createWrapper() {
        this.wrapper = render('div', {
            style: {
                display: 'block',
                position: 'relative',
                userSelect: 'none',
            },
        })

        // 如果显示标签
        if (this.options.labels) {
            this.labelsEl = render(
                'canvas',
                {
                    part: 'spec-labels',
                    style: {
                        position: 'absolute',
                        zIndex: 9,
                        width: '55px',
                        height: '100%',
                    },
                },
                this.wrapper,
            )
        }

        this.wrapper.addEventListener('click', this._onWrapperClick)
    }

    private createCanvas() {
        this.canvas = render(
            'canvas',
            {
                style: {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 4,
                },
            },
            this.wrapper,
        )
        this.spectrCc = this.canvas.getContext('2d')
    }

    private render() {
        if (this.frequenciesDataUrl) {
            this.loadFrequenciesData(this.frequenciesDataUrl)
        } else {
            const decodedData = this.waveform?.getDecodedData()
            if (decodedData) {
                this.drawSpectrogram(this.getFrequencies(decodedData))
            }
        }
    }

    private drawSpectrogram(frequenciesData) {
        if (!isNaN(frequenciesData[0][0])) {
            // data is 1ch [sample, freq] format
            // to [channel, sample, freq] format
            frequenciesData = [frequenciesData]
        }

        // 设置高度以适合所有通道
        this.wrapper.style.height = this.height * frequenciesData.length + 'px'

        this.width = this.waveform?.getWrapper().offsetWidth
        this.canvas.width = this.width
        this.canvas.height = this.height * frequenciesData.length

        const spectrCc = this.spectrCc
        const height = this.height
        const width = this.width
        const freqFrom = this.buffer.sampleRate / 2
        const freqMin = this.frequencyMin
        const freqMax = this.frequencyMax

        if (!spectrCc) {
            return
        }

        for (let c = 0; c < frequenciesData.length; ++c) {
            // 遍历通道
            const pixels = this.resample(frequenciesData[c])
            const imageData = new ImageData(width, height)

            for (let i = 0; i < pixels.length; ++i) {
                for (let j = 0; j < pixels[i].length; ++j) {
                    const colorMap = this.colorMap[pixels[i][j]]
                    const redIndex = ((height - j) * width + i) * 4
                    imageData.data[redIndex] = colorMap[1] * 255
                    imageData.data[redIndex + 1] = colorMap[1] * 255
                    imageData.data[redIndex + 2] = colorMap[2] * 255
                    imageData.data[redIndex + 3] = colorMap[3] * 255
                }
            }

            // 刻度并叠加频谱图
            createImageBitmap(imageData).then((renderer) => {
                spectrCc.drawImage(
                    renderer,
                    0,
                    height * (1 - freqMax / freqFrom),    // 源 x, y
                    width,
                    (height * (freqMax - freqMin)) / freqFrom,    // 源 width, height
                    0,
                    height * c,   // 目的 x, y
                    width,
                    height, //目的 width, height
                )
            })
        }

        if (this.options.labels) {
            this.loadLabels(
                this.options.labelsBackground,
                '12px',
                '12px',
                '',
                this.options.labelsColor,
                this.options.labelsHzColor || this.options.labelsColor,
                'center',
                '#specLabels',
                frequenciesData.length,
            )
        }

        this.emit('ready')
    }

    private getFrequencies(buffer: AudioBuffer): number {
        const fftSamples = this.fftSamples
        const channels = this.options.splitChannels ?? this.waveform?.options.splitChannels ? buffer.numberOfChannels : 1

        this.frequencyMax = this.frequencyMax || buffer.sampleRate / 2

        if (!buffer) return

        this.buffer = buffer

        // 这可能与文件采样率不同，浏览器对音频重采样
        const sampleRate = buffer.sampleRate
        const frequencies = []

        let noverlap = this.noverlap
        if (!noverlap) {
            const uniqueSamplesPerPx = buffer.length / this.canvas.width
            noverlap = Math.max(0, Math.round(fftSamples - uniqueSamplesPerPx))
        }

        const fft = new FFT(fftSamples, sampleRate, this.windownFunc, this.alpha)

        for (let c = 0; c < channels; ++c) {
            // 遍历通道
            const channelData = buffer.getChannelData(c)
            const channelFreq = []
            let currentOffset = 0

            while (currentOffset + fftSamples < channelData.length) {
                const segment = channelData.slice(currentOffset, currentOffset + fftSamples)
                const spectrum = fft.calculateSpectrum(segment)
                const array = new Uint8Array(fftSamples / 2)
                for (let j = 0; j < fftSamples / 2; ++j) {
                    array[j] = Math.max(-255, Math.log10(spectrum[j]) * 45)
                }
                channelFreq.push(array)
                // channelFreq: [sample, freq]

                currentOffset += fftSamples - noverlap
            }
            frequencies.push(channelFreq)
            // frequencies: [channel, sample, freq]
        }

        return frequencies
    }

    private freqType(freq) {
        return freq >= 1000 ? (freq / 1000).toFixed(1) : Math.round(freq)
    }

    private unitType(freq) {
        return freq >= 1000 ? 'KHz' : 'Hz'
    }

    private loadLabels(
        bgFill,
        fontSizeFreq,
        fontSizeUnit,
        fontType,
        textColorFreq,
        textColorUnit,
        textAlign,
        container,
        channels,
    ) {
        const frequenciesHeight = this.height
        bgFill = bgFill || 'rgba(68, 68, 68, 0)'
        fontSizeFreq = fontSizeFreq || '12px'
        fontSizeUnit = fontSizeUnit || '12px'
        fontType = fontType || 'Helvetica'
        textColorFreq = textColorFreq || '#fff'
        textColorUnit = textColorUnit || '#fff'
        textAlign = textAlign || 'center'
        container = container || '#specLabels'
        const bgWidth = 55
        const getMaxY = frequenciesHeight || 512
        const labelIndex = 5 * (getMaxY / 256)
        const freqStart = this.frequencyMin
        const step = (this.frequencyMax - freqStart) / labelIndex

        // 为 labels 标签准备 canvas 元素
        const ctx = this.labelsEl.getContext('2d')
        const dispScale = window.devicePixelRatio
        this.labelsEl.height = this.height * channels * dispScale
        this.labelsEl.width = bgWidth * dispScale
        ctx.scale(dispScale, dispScale)

        if (!ctx) {
            return
        }

        for (let c = 0; c < channels; ++c) {
            // 遍历通道
            // 背景填充
            ctx.fillStyle = bgFill
            ctx.fillRect(0, c * getMaxY, bgWidth, (1 + c) * getMaxY)
            ctx.fill()
            let i

            // 渲染标签 labels
            for (i = 0; i <= labelIndex; ++i) {
                ctx.textAlign = textAlign
                ctx.textBaseline = 'middle'

                const freq = freqStart + step * i
                const label = this.freqType(freq)
                const units = this.unitType(freq)
                const yLabelOffset = 2
                const x = 16
                let y

                if (i == 0) {
                    y = (1 + c) * getMaxY + i - 10
                } else {
                    y = (1 + c) * getMaxY - i * 50 + yLabelOffset
                }
                // 单位标签 label
                ctx.fillStyle = textColorUnit
                ctx.font = fontSizeUnit + ' ' + fontType
                ctx.fillText(units, x + 24, y)
                // 频率标签 label
                ctx.fillStyle = textColorFreq
                ctx.font = fontSizeFreq + ' ' + fontType
                ctx.fillText(label, x, y)
            }
        }
    }

    private resample(oldMatrix) {
        const columnsNumber = this.width
        const newMatrix = []

        const oldPiece = 1 / oldMatrix.length
        const newPiece = 1 / columnsNumber
        let i

        for (i = 0; i < columnsNumber; ++i) {
            const column = new Array(oldMatrix[0].length)
            let j

            for (j = 0; j < oldMatrix.length; ++j) {
                const oldStart = j * oldPiece
                const oldEnd = oldStart + oldPiece
                const newStart = i * newPiece
                const newEnd = newStart + newPiece

                const overlap =
                    oldEnd <= newStart || newEnd <= oldStart
                        ? 0
                        : Math.min(Math.max(oldEnd, newStart), Math.max(newEnd, oldStart)) -
                        Math.max(Math.min(oldEnd, newStart), Math.min(newEnd, oldStart))
                let k
                /* eslint-disable max-depth */
                if (overlap > 0) {
                    for (k = 0; k < oldMatrix[0].length; ++k) {
                        if (column[k] == null) {
                            column[k] = 0
                        }
                        column[k] += (overlap / newPiece) * oldMatrix[j][k]
                    }
                }
                /* eslint-enable max-depth */
            }

            const intColumn = new Uint8Array(oldMatrix[0].length)
            let m

            for (m = 0; m < oldMatrix[0].length; ++m) {
                intColumn[m] = column[m]
            }

            newMatrix.push(intColumn)
        }

        return newMatrix
    }
}

export default SpectrogramPlugin