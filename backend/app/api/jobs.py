from flask import Blueprint, jsonify

from ..models import ProcessingJob

jobs_bp = Blueprint("jobs", __name__)


@jobs_bp.route("/jobs/<job_id>", methods=["GET"])
def get_job_status(job_id):
    job = ProcessingJob.query.get_or_404(job_id)
    return jsonify(job.to_dict())
