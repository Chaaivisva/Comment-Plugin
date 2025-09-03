from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Comment, Notification, CommentRecipient

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email"]

class CommentRecipientSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommentRecipient
        fields = ['recipient_email']

class CommentSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    replies = serializers.SerializerMethodField()
    recipients = CommentRecipientSerializer(many=True, read_only=True)
    unique_reply_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Comment
        fields = [
            "id",
            "user",
            "page_url",
            "selected_text",
            "comment_text",
            "parent",
            "recipients",
            "replies",
            "unique_reply_id",
            "created_at",
        ]
        read_only_fields = ["user", "replies", "unique_reply_id", "created_at"]

    def get_replies(self, obj):
        qs = obj.replies.all().order_by("created_at")
        return CommentSerializer(qs, many=True, context=self.context).data

class NotificationSerializer(serializers.ModelSerializer):
    comment = CommentSerializer(read_only=True)
    recipient = UserSerializer(read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "recipient", "comment", "is_read", "created_at"]
        read_only_fields = ["recipient", "comment", "created_at"]
