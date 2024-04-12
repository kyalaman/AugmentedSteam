import {
    __calcWorkshopSize_calcFinished, __calcWorkshopSize_calcLoading,
    __calcWorkshopSize_calcSize,
    __calcWorkshopSize_fileSize, __calcWorkshopSize_totalSize, __workshop_failed,
} from "../../../../../localization/compiled/_strings";
import {L} from "../../../../Core/Localization/Localization";
import {HTML, Localization} from "../../../../modulesCore";
import {Background, Feature, RequestData} from "../../../modulesContent";
import {Page} from "../../Page";

export default class FWorkshopFileSizes extends Feature {

    checkPrerequisites() {
        // Check if the user is signed in, viewing own profile, and has subscribed to at least one item
        return document.querySelector(".primary_panel") !== null
            && document.querySelector(".workshopBrowsePagingInfo") !== null;
    }

    apply() {

        HTML.beforeEnd(".primary_panel",
            `<div class="menu_panel">
                <div class="rightSectionHolder">
                    <div class="rightDetailsBlock">
                        <span class="btn_grey_steamui btn_medium" id="es_calc_size">
                            <span>${L(__calcWorkshopSize_calcSize)}</span>
                        </span>
                    </div>
                </div>
            </div>`);

        document.getElementById("es_calc_size").addEventListener("click", () => {
            const pagingInfo = document.querySelector(".workshopBrowsePagingInfo").textContent;
            this._total = Math.max(...pagingInfo.replace(/,/g, "").match(/\d+/g));

            this._startCalculation();
        });

        this._addFileSizes(); // Doesn't actually fetch any data unless total size has been calculated before
    }

    async _addFileSizes() {

        for (const node of document.querySelectorAll(".workshopItemSubscription[id*=Subscription]")) {
            if (node.classList.contains("as-has-filesize")) { continue; }

            const size = await this._getFileSize(node, true).catch(err => console.error(err));
            if (!size) { continue; }

            const str = L(__calcWorkshopSize_fileSize, {"size": this._getFileSizeStr(size)});
            HTML.beforeEnd(node.querySelector(".workshopItemSubscriptionDetails"), `<div class="workshopItemDate">${str}</div>`);
            node.classList.add("as-has-filesize");
        }
    }

    async _startCalculation() {

        this._completed = 0;
        this._failed = 0;
        this._totalSize = 0;

        this._updateWaitDialog();

        const parser = new DOMParser();
        const url = new URL(window.location.origin + window.location.pathname);
        url.searchParams.set("browsefilter", "mysubscriptions");
        url.searchParams.set("numperpage", 30);

        for (let p = 1; p <= Math.ceil(this._total / 30); p++) {
            url.searchParams.set("p", p);

            const result = await RequestData.getHttp(url).catch(err => console.error(err));
            if (!result) {
                console.error(`Failed to request ${url}`);
                continue;
            }

            const doc = parser.parseFromString(result, "text/html");
            for (const node of doc.querySelectorAll(".workshopItemSubscription[id*=Subscription]")) {
                try {
                    const size = await this._getFileSize(node);

                    this._completed++;
                    this._totalSize += size;
                } catch (err) {
                    this._failed++;
                    console.error(err);
                } finally {
                    this._updateWaitDialog();
                }
            }
        }

        let resultString = L(__calcWorkshopSize_calcFinished, {
            "success": this._completed,
            "total": this._total
        });

        resultString += "<br>";

        resultString += L(__calcWorkshopSize_totalSize, {
            "size": this._getFileSizeStr(this._totalSize)
        });

        Page.runInPageContext((title, result) => {
            window.SteamFacade.dismissActiveModal();
            window.SteamFacade.showAlertDialog(title, result);
        }, [L(__calcWorkshopSize_calcSize), resultString]);

        this._addFileSizes(); // Add file sizes now that data has been fetched
    }

    _updateWaitDialog() {

        let statusString = L(__calcWorkshopSize_calcLoading, {
            "i": this._completed,
            "count": this._total
        });

        if (this._failed > 0) {
            statusString += "<br>";
            statusString += L(__workshop_failed, {"n": this._failed});
        }

        const container = document.querySelector("#as_loading_text_ctn");
        if (container) {
            HTML.inner(container, statusString);
        } else {
            Page.runInPageContext((title, progress) => {
                window.SteamFacade.showBlockingWaitDialog(title, `<div id="as_loading_text_ctn">${progress}</div>`);
            }, [L(__calcWorkshopSize_calcSize), statusString]);
        }
    }

    _getFileSizeStr(size) {
        const units = ["TB", "GB", "MB", "KB"];

        const index = units.findIndex((unit, i) => size / (1000 ** (units.length - (i + 1))) >= 1);
        return `${(size / (1000 ** (units.length - (index + 1)))).toFixed(2)} ${units[index]}`;
    }

    _getFileSize(node, preventFetch = false) {
        const id = Number(node.id.replace("Subscription", ""));
        return Background.action("workshopfilesize", id, preventFetch);
    }
}
